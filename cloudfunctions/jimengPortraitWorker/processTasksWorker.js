const cloud = require('wx-server-sdk');
const { submitJimengTask, pollJimengTask } = require('./lib/jimeng');
const { deleteReplacedCloudFile } = require('./lib/cloudFile');
const { chargeStoreForPortrait } = require('./lib/balance');
const { toUserFacingError, TIMEOUT_FAIL } = require('./lib/userFacingError');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STYLE_TEMPLATES_COLLECTION = 'style_templates';
const STALE_TASK_MS = 30 * 60 * 1000;

/** 单次云函数预算（与 jimengPortraitWorker timeout 60s 对齐，留 ~5s 缓冲） */
const WORKER_BUDGET_MS = 55000;
const SUBMIT_MIN_REMAINING_MS = 3500;
const POLL_BUDGET_MS = 14000;

async function getImageUrl(photoFileID) {
  if (photoFileID && String(photoFileID).startsWith('cloud')) {
    const res = await cloud.getTempFileURL({ fileList: [photoFileID] });
    return res.fileList[0].tempFileURL;
  }
  return photoFileID;
}

function parseResolution(resolution) {
  let width = 1024;
  let height = 1024;
  if (resolution) {
    const parts = String(resolution).split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      width = parts[0];
      height = parts[1];
    }
  }
  return { width, height };
}

async function resolvePrompt(task) {
  if (task.prompt) return task.prompt;
  const styleId = task.styleId;
  if (!styleId) throw new Error('任务缺少 styleId');
  const styleRes = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: styleId }).get();
  if (!styleRes.data.length) throw new Error(`风格不存在，styleId: ${styleId}`);
  const prompt = styleRes.data[0].prompt;
  if (!prompt) throw new Error('风格缺少 prompt');
  return prompt;
}

async function markTaskFailed(task, errMsg, technicalMsg) {
  const userMsg = toUserFacingError(errMsg);
  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'failed',
      errorMsg: technicalMsg || String(errMsg || ''),
      userErrorMsg: userMsg,
      updateTime: new Date()
    }
  });
  await db
    .collection('photos')
    .doc(task.photoId)
    .update({
      data: { generateStatus: 'failed', errorMsg: userMsg, updateTime: new Date() }
    })
    .catch((e) => console.warn('[jimengPortraitWorker] 更新照片失败状态失败', e.message || e));
}

function isTaskStale(task) {
  const raw = task.createTime || task.updateTime;
  if (!raw) return false;
  const ts = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  if (!ts || Number.isNaN(ts)) return false;
  return Date.now() - ts > STALE_TASK_MS;
}

async function completeTask(task, resultBuffer, previousAiUrl) {
  const cloudPath = `ai-generated/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;
  const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: resultBuffer });

  await db.collection('photos').doc(task.photoId).update({
    data: {
      aiUrl: uploadRes.fileID,
      isGenerated: true,
      generateStatus: 'completed',
      errorMsg: null,
      updateTime: new Date()
    }
  });
  await deleteReplacedCloudFile(previousAiUrl, uploadRes.fileID);
  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'completed',
      resultFileID: uploadRes.fileID,
      updateTime: new Date()
    }
  });

  console.log('[jimengPortraitWorker] 任务完成', task._id);
  return { processed: 1, completed: true, taskId: task._id };
}

async function pickTaskForSubmit(priorityBatchId) {
  const res = await db
    .collection('ai_tasks')
    .where({ status: 'pending', engine: 'jimeng' })
    .orderBy('createTime', 'asc')
    .limit(30)
    .get();
  const list = res.data || [];
  if (!list.length) return null;
  const batchId = String(priorityBatchId || '').trim();
  if (batchId) {
    const hit = list.find((t) => String(t.batchId || '') === batchId);
    if (hit) return hit;
  }
  return list[0];
}

async function pickTaskForPoll() {
  const res = await db
    .collection('ai_tasks')
    .where({ status: 'processing', engine: 'jimeng' })
    .orderBy('updateTime', 'asc')
    .limit(15)
    .get();
  const list = (res.data || []).filter((t) => (t.jimengTaskId || '').trim());
  return list[0] || null;
}

/** 阶段 A：扣费（若未预扣）→ submit 即梦 → 写 jimengTaskId */
async function runSubmitPhase(task) {
  if (isTaskStale(task)) {
    console.warn('[jimengPortraitWorker] 任务超时', task._id);
    await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    return { processed: 0, error: TIMEOUT_FAIL };
  }

  const photoRes = await db.collection('photos').doc(task.photoId).get();
  if (!photoRes.data) throw new Error('照片不存在');
  const photo = photoRes.data;

  if (task.status === 'pending') {
    await db.collection('ai_tasks').doc(task._id).update({
      data: { status: 'processing', updateTime: new Date() }
    });
    await db
      .collection('photos')
      .doc(task.photoId)
      .update({ data: { generateStatus: 'processing', updateTime: new Date() } })
      .catch(() => {});
  }

  if (!task.charged) {
    const storeId = task.storeId || photo.storeId;
    await chargeStoreForPortrait(storeId, task._id);
    task.charged = true;
  }

  const prompt = await resolvePrompt(task);
  const { width, height } = parseResolution(task.resolution);
  const imageUrl = await getImageUrl(photo.originalUrl);

  console.log('[jimengPortraitWorker] 提交即梦', task._id);
  const jimengTaskId = await submitJimengTask(imageUrl, prompt, { width, height });

  await db.collection('ai_tasks').doc(task._id).update({
    data: { jimengTaskId, status: 'processing', updateTime: new Date() }
  });
  await db.collection('photos').doc(task.photoId).update({
    data: { generateStatus: 'processing', updateTime: new Date() }
  });

  return { processed: 1, submitted: true, taskId: task._id };
}

/** 阶段 B：短预算轮询即梦结果 */
async function runPollPhase(task, budgetMs) {
  if (isTaskStale(task)) {
    console.warn('[jimengPortraitWorker] 任务超时', task._id);
    await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    return { processed: 0, error: TIMEOUT_FAIL };
  }

  const jimengTaskId = (task.jimengTaskId || '').trim();
  if (!jimengTaskId) {
    return runSubmitPhase(task);
  }

  const photoRes = await db.collection('photos').doc(task.photoId).get();
  if (!photoRes.data) throw new Error('照片不存在');
  const previousAiUrl = photoRes.data.aiUrl || '';

  const pollResult = await pollJimengTask(jimengTaskId, {
    budgetMs: Math.max(3000, budgetMs),
    skipInitialDelay: true
  });

  if (pollResult.status === 'done') {
    return completeTask(task, pollResult.buffer, previousAiUrl);
  }

  await db.collection('ai_tasks').doc(task._id).update({
    data: { status: 'processing', jimengTaskId, updateTime: new Date() }
  });
  console.log('[jimengPortraitWorker] 即梦未完成，下轮续查', task._id);
  return { processed: 0, continuing: true, taskId: task._id };
}

async function workerStep(event, deadline) {
  const remaining = deadline - Date.now();
  if (remaining < 2000) return { processed: 0 };

  const priorityBatchId = String(event.priorityBatchId || '').trim();
  const pendingTask = await pickTaskForSubmit(priorityBatchId);
  const pollTask = await pickTaskForPoll();

  try {
    if (pendingTask && remaining > SUBMIT_MIN_REMAINING_MS) {
      return await runSubmitPhase(pendingTask);
    }
    if (pollTask) {
      const budget = Math.min(POLL_BUDGET_MS, remaining - 800);
      return await runPollPhase(pollTask, budget);
    }
    if (pendingTask) {
      return await runSubmitPhase(pendingTask);
    }
    return { processed: 0 };
  } catch (err) {
    const active = pendingTask || pollTask;
    if (active) {
      console.error('[jimengPortraitWorker] 步骤失败', active._id, err.message);
      if (err.response) {
        try {
          console.error(
            '[jimengPortraitWorker] 响应:',
            JSON.stringify(err.response.data).substring(0, 1000)
          );
        } catch (e) {
          /* ignore */
        }
      }
      await markTaskFailed(active, err.message, err.message);
      return { processed: 0, error: toUserFacingError(err) };
    }
    throw err;
  }
}

async function main(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  const source =
    event.Type === 'Timer' || event.TriggerName
      ? 'timer'
      : event.action === 'run'
        ? 'kick'
        : 'manual';
  console.log('[jimengPortraitWorker] 触发来源', source, event.priorityBatchId || '');

  const deadline = Date.now() + WORKER_BUDGET_MS;
  let lastResult = { processed: 0 };
  let completedCount = 0;
  let submittedCount = 0;

  while (Date.now() < deadline) {
    lastResult = await workerStep(event, deadline);
    if (lastResult.completed) {
      completedCount += 1;
      continue;
    }
    if (lastResult.submitted) {
      submittedCount += 1;
      continue;
    }
    if (lastResult.continuing) {
      continue;
    }
    if (lastResult.error) {
      continue;
    }
    break;
  }

  const summary = { ...lastResult, completedCount, submittedCount, source };
  console.log('[jimengPortraitWorker] 结束', JSON.stringify(summary));
  return summary;
}

module.exports = { main };
