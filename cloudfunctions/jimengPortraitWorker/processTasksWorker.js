const cloud = require('wx-server-sdk');
const { submitJimengTask, pollJimengTask } = require('./lib/jimeng');
const { deleteReplacedCloudFile } = require('./lib/cloudFile');
const { chargeStoreForPortrait } = require('./lib/balance');
const { toUserFacingError, TIMEOUT_FAIL } = require('./lib/userFacingError');
const { isJimengRateLimitError } = require('./lib/jimengRateLimit');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STYLE_TEMPLATES_COLLECTION = 'style_templates';
const STALE_TASK_MS = 30 * 60 * 1000;
const MAX_SUBMIT_ATTEMPTS = 4;
const MAX_POLL_ATTEMPTS = 20;
const STUCK_PROCESSING_GRACE_MS = 8000;

/** 微信云函数最长 60s，留 ~5s 缓冲给平台收尾 */
const WORKER_BUDGET_MS = 55000;
const POLL_BUDGET_MS = 10000;

async function getImageUrl(photoFileID) {
  if (photoFileID && String(photoFileID).startsWith('cloud')) {
    const res = await cloud.getTempFileURL({ fileList: [photoFileID] });
    const item = res.fileList && res.fileList[0];
    if (!item || item.status !== 0 || !item.tempFileURL) {
      const detail = (item && item.errMsg) || 'unknown';
      throw new Error(`原图临时链接获取失败: ${detail}`);
    }
    return item.tempFileURL;
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
      phase: 'failed',
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

function taskTimestamp(task) {
  const raw = task.updateTime || task.createTime;
  if (!raw) return 0;
  const ts = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function pickByBatchFirst(list, priorityBatchId) {
  if (!list.length) return null;
  const batchId = String(priorityBatchId || '').trim();
  if (!batchId) return list[0];
  return list.find((t) => String(t.batchId || '') === batchId) || null;
}

/** 清理超时任务，避免旧队列阻塞当前 batch */
async function purgeStaleTasks(tasks) {
  const active = [];
  for (const task of tasks) {
    if (!isTaskStale(task)) {
      active.push(task);
      continue;
    }
    console.warn('[jimengPortraitWorker] 清理 stale 任务', task._id, task.batchId || '');
    try {
      await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    } catch (e) {
      console.warn('[jimengPortraitWorker] stale 清理失败', task._id, e.message || e);
    }
  }
  return active;
}

function isTransientError(err) {
  if (!err) return false;
  if (isJimengRateLimitError(err)) return true;
  const msg = String(err.message || '');
  if (/timeout|ECONNRESET|ETIMEDOUT|socket hang up|network|502|503|504/i.test(msg)) {
    return true;
  }
  const status = err.response && err.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

async function getFreshTask(task) {
  const freshRes = await db.collection('ai_tasks').doc(task._id).get().catch(() => null);
  return (freshRes && freshRes.data) || task;
}

function logHttpError(prefix, err) {
  console.error(prefix, err.message);
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
}

async function claimTaskForSubmit(task) {
  const jimengTaskId = (task.jimengTaskId || '').trim();
  if (jimengTaskId) return false;

  if (task.status === 'pending') {
    const res = await db
      .collection('ai_tasks')
      .where({ _id: task._id, status: 'pending' })
      .update({
        data: { status: 'processing', phase: 'submit', updateTime: new Date() }
      });
    return !!(res.stats && res.stats.updated);
  }

  if (task.status === 'processing') {
    const age = Date.now() - taskTimestamp(task);
    return age >= STUCK_PROCESSING_GRACE_MS;
  }

  return false;
}

/** submit 阶段临时失败：可清 jimengTaskId 回 pending 重试 */
async function handleSubmitFailure(task, err) {
  logHttpError('[jimengPortraitWorker] submit 失败', err);

  const freshTask = await getFreshTask(task);
  if (!isTransientError(err)) {
    await markTaskFailed(freshTask, err.message, err.message);
    return { processed: 0, error: toUserFacingError(err) };
  }

  const attempts = Number(freshTask.submitAttempts || 0) + 1;
  if (attempts >= MAX_SUBMIT_ATTEMPTS) {
    await markTaskFailed(freshTask, err.message, err.message);
    return { processed: 0, error: toUserFacingError(err) };
  }

  console.warn(
    `[jimengPortraitWorker] submit 临时失败，回队 ${attempts}/${MAX_SUBMIT_ATTEMPTS}`,
    task._id,
    err.message
  );

  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'pending',
      phase: 'submit',
      jimengTaskId: null,
      submitAttempts: attempts,
      lastError: String(err.message || ''),
      updateTime: new Date()
    }
  });
  await db
    .collection('photos')
    .doc(task.photoId)
    .update({
      data: { generateStatus: 'pending', errorMsg: null, updateTime: new Date() }
    })
    .catch(() => {});

  return { processed: 0, submitRetry: true, taskId: task._id };
}

/** poll 阶段临时失败：保留 jimengTaskId，下轮定时器续查 */
async function handlePollFailure(task, err) {
  logHttpError('[jimengPortraitWorker] poll 失败', err);

  const freshTask = await getFreshTask(task);
  const jimengTaskId = (freshTask.jimengTaskId || '').trim();
  if (!jimengTaskId) {
    return handleSubmitFailure(freshTask, err);
  }

  if (!isTransientError(err)) {
    await markTaskFailed(freshTask, err.message, err.message);
    return { processed: 0, error: toUserFacingError(err) };
  }

  const pollAttempts = Number(freshTask.pollAttempts || 0) + 1;
  if (pollAttempts >= MAX_POLL_ATTEMPTS) {
    await markTaskFailed(
      freshTask,
      err.message,
      `poll attempts exhausted: ${err.message}`
    );
    return { processed: 0, error: toUserFacingError(err) };
  }

  console.warn(
    `[jimengPortraitWorker] poll 限流/临时失败，下轮续查 ${pollAttempts}/${MAX_POLL_ATTEMPTS}`,
    task._id,
    err.message
  );

  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'processing',
      phase: 'poll',
      pollAttempts,
      lastError: String(err.message || ''),
      lastPollAt: new Date(),
      updateTime: new Date()
    }
  });

  return { processed: 0, pollRetry: true, taskId: task._id };
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
      phase: 'done',
      resultFileID: uploadRes.fileID,
      errorMsg: null,
      lastError: null,
      updateTime: new Date()
    }
  });

  console.log('[jimengPortraitWorker] 任务完成', task._id);
  return { processed: 1, completed: true, taskId: task._id };
}

async function pickTaskForSubmit(priorityBatchId) {
  const pendingRes = await db
    .collection('ai_tasks')
    .where({ status: 'pending', engine: 'jimeng' })
    .orderBy('createTime', 'asc')
    .limit(30)
    .get();
  let pending = await purgeStaleTasks(pendingRes.data || []);
  const pendingHit = pickByBatchFirst(pending, priorityBatchId);
  if (pendingHit) return pendingHit;

  const procRes = await db
    .collection('ai_tasks')
    .where({ status: 'processing', engine: 'jimeng' })
    .orderBy('updateTime', 'asc')
    .limit(20)
    .get();
  let stuck = (procRes.data || []).filter((t) => !(t.jimengTaskId || '').trim());
  stuck = await purgeStaleTasks(stuck);
  return pickByBatchFirst(stuck, priorityBatchId);
}

async function pickTaskForPoll(priorityBatchId) {
  const res = await db
    .collection('ai_tasks')
    .where({ status: 'processing', engine: 'jimeng' })
    .orderBy('updateTime', 'asc')
    .limit(15)
    .get();
  let list = (res.data || []).filter((t) => (t.jimengTaskId || '').trim());
  list = await purgeStaleTasks(list);
  return pickByBatchFirst(list, priorityBatchId);
}

/** 阶段 A：扣费 → submit 即梦 → 写 jimengTaskId（同次调用不 poll） */
async function runSubmitPhase(task) {
  if (isTaskStale(task)) {
    console.warn('[jimengPortraitWorker] 任务超时', task._id);
    await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    return { processed: 0, error: TIMEOUT_FAIL };
  }

  const claimed = await claimTaskForSubmit(task);
  if (!claimed) {
    return { processed: 0, skipped: true };
  }

  try {
    const freshRes = await db.collection('ai_tasks').doc(task._id).get();
    if (!freshRes.data) throw new Error('任务不存在');
    task = freshRes.data;

    const photoRes = await db.collection('photos').doc(task.photoId).get();
    if (!photoRes.data) throw new Error('照片不存在');
    const photo = photoRes.data;

    await db
      .collection('photos')
      .doc(task.photoId)
      .update({ data: { generateStatus: 'processing', errorMsg: null, updateTime: new Date() } })
      .catch(() => {});

    if (!task.charged) {
      const storeId = task.storeId || photo.storeId;
      await chargeStoreForPortrait(storeId, task._id);
      task.charged = true;
    }

    const prompt = await resolvePrompt(task);
    const { width, height } = parseResolution(task.resolution);
    const imageUrl = await getImageUrl(photo.originalUrl);

    console.log('[jimengPortraitWorker] 提交即梦', task._id, task.styleId || '');
    const jimengTaskId = await submitJimengTask(imageUrl, prompt, { width, height });

    await db.collection('ai_tasks').doc(task._id).update({
      data: {
        jimengTaskId,
        status: 'processing',
        phase: 'poll',
        submitAttempts: 0,
        pollAttempts: 0,
        lastError: null,
        errorMsg: null,
        updateTime: new Date()
      }
    });
    await db.collection('photos').doc(task.photoId).update({
      data: { generateStatus: 'processing', updateTime: new Date() }
    });

    return { processed: 1, submitted: true, taskId: task._id };
  } catch (err) {
    return handleSubmitFailure(task, err);
  }
}

/** 阶段 B：短预算 poll，未完成则下轮定时器续查 */
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

  try {
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
      data: {
        status: 'processing',
        phase: 'poll',
        jimengTaskId,
        lastPollAt: new Date(),
        updateTime: new Date()
      }
    });
    console.log('[jimengPortraitWorker] 即梦未完成，下轮续查', task._id);
    return { processed: 0, continuing: true, taskId: task._id };
  } catch (err) {
    return handlePollFailure(task, err);
  }
}

/**
 * 单次云函数调用只推进一步：优先 poll 在途任务，否则 submit 下一条 pending。
 */
async function workerStep(event, deadline) {
  const remaining = deadline - Date.now();
  if (remaining < 2000) return { processed: 0 };

  const priorityBatchId = String(event.priorityBatchId || '').trim();
  const pollTask = await pickTaskForPoll(priorityBatchId);
  const pendingTask = await pickTaskForSubmit(priorityBatchId);

  if (pollTask) {
    const budget = Math.min(POLL_BUDGET_MS, remaining - 1500);
    return runPollPhase(pollTask, budget);
  }
  if (pendingTask) {
    return runSubmitPhase(pendingTask);
  }
  return { processed: 0 };
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
  const result = await workerStep(event, deadline);
  const summary = { ...result, source, budgetMs: WORKER_BUDGET_MS };
  console.log('[jimengPortraitWorker] 结束', JSON.stringify(summary));
  return summary;
}

module.exports = { main };
