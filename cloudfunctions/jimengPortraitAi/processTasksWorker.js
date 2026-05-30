const cloud = require('wx-server-sdk');
const { submitJimengTask, pollJimengTask, DEFAULT_POLL_BUDGET_MS } = require('./lib/jimeng');
const { deleteReplacedCloudFile } = require('./lib/cloudFile');
const { chargeStoreForPortrait } = require('./lib/balance');
const { toUserFacingError, TIMEOUT_FAIL } = require('./lib/userFacingError');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STYLE_TEMPLATES_COLLECTION = 'style_templates';
const STALE_TASK_MS = 30 * 60 * 1000;

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
  if (!styleId) {
    throw new Error('任务缺少 styleId');
  }
  const styleRes = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: styleId }).get();
  if (!styleRes.data.length) {
    throw new Error(`风格不存在，styleId: ${styleId}`);
  }
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
    .catch((e) => console.warn('[jimengPortraitAi/worker] 更新照片失败状态失败', e.message || e));
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

  console.log('[jimengPortraitAi/worker] 任务完成', task._id);
  return { processed: 1, completed: true };
}

async function processTask(task) {
  const photoRes = await db.collection('photos').doc(task.photoId).get();
  if (!photoRes.data) throw new Error('照片不存在');
  const photo = photoRes.data;
  const previousAiUrl = photo.aiUrl || '';

  const prompt = await resolvePrompt(task);
  const { width, height } = parseResolution(task.resolution);

  let jimengTaskId = task.jimengTaskId || null;

  if (!jimengTaskId) {
    if (!task.charged) {
      const storeId = task.storeId || photo.storeId;
      await chargeStoreForPortrait(storeId, task._id);
      task.charged = true;
    }

    const imageUrl = await getImageUrl(photo.originalUrl);
    console.log('[jimengPortraitAi/worker] 提交即梦', task._id);
    jimengTaskId = await submitJimengTask(imageUrl, prompt, { width, height });
    await db.collection('ai_tasks').doc(task._id).update({
      data: { jimengTaskId, status: 'processing', updateTime: new Date() }
    });
    await db.collection('photos').doc(task.photoId).update({
      data: { generateStatus: 'processing', updateTime: new Date() }
    });
  }

  const pollResult = await pollJimengTask(jimengTaskId, {
    budgetMs: DEFAULT_POLL_BUDGET_MS,
    skipInitialDelay: !!task.jimengTaskId
  });

  if (pollResult.status === 'done') {
    return completeTask(task, pollResult.buffer, previousAiUrl);
  }

  await db.collection('ai_tasks').doc(task._id).update({
    data: { status: 'processing', jimengTaskId, updateTime: new Date() }
  });
  console.log('[jimengPortraitAi/worker] 即梦未完成，等待下次定时续查', task._id);
  return { processed: 0, continuing: true, taskId: task._id };
}

async function pickNextTask() {
  const processingRes = await db
    .collection('ai_tasks')
    .where({ status: 'processing', engine: 'jimeng' })
    .orderBy('updateTime', 'asc')
    .limit(1)
    .get();
  if (processingRes.data.length) return processingRes.data[0];

  const pendingRes = await db
    .collection('ai_tasks')
    .where({ status: 'pending', engine: 'jimeng' })
    .orderBy('createTime', 'asc')
    .limit(1)
    .get();

  return pendingRes.data.length ? pendingRes.data[0] : null;
}

async function pollOnce() {
  const task = await pickNextTask();
  if (!task) return { processed: 0 };

  console.log('[jimengPortraitAi/worker] 处理任务', task._id, 'status=', task.status);

  if (isTaskStale(task)) {
    console.warn('[jimengPortraitAi/worker] 任务超时', task._id);
    await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    return { processed: 0, error: TIMEOUT_FAIL };
  }

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

  try {
    return await processTask({ ...task, status: 'processing' });
  } catch (err) {
    console.error('[jimengPortraitAi/worker] 任务失败', task._id, err.message);
    if (err.response) {
      try {
        console.error('[jimengPortraitAi/worker] 响应:', JSON.stringify(err.response.data).substring(0, 1000));
      } catch (e) {
        /* ignore */
      }
    }
    await markTaskFailed(task, err.message, err.message);
    return { processed: 0, error: toUserFacingError(err) };
  }
}

async function main(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log('[jimengPortraitAi/worker] 定时触发');
  const result = await pollOnce();
  console.log('[jimengPortraitAi/worker] 结束', JSON.stringify(result));
  return result;
}

module.exports = { main };
