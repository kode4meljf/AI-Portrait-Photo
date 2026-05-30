/**
 * 即梦 AI 写真云函数封装
 */

function callJimengPortraitAi(data) {
  return wx.cloud.callFunction({
    name: 'jimengPortraitAi',
    data
  }).then((res) => {
    const result = res.result || {};
    if (result.success === false) {
      const err = new Error(result.error || '即梦任务提交失败');
      if (result.code) err.code = result.code;
      throw err;
    }
    return result;
  });
}

function submitPortraitTask(photoId, styleId) {
  return callJimengPortraitAi({
    action: 'submit',
    photoId,
    styleId
  });
}

/** 批次入队 + 预扣 balance（拍摄 3/9 风格） */
function submitPortraitBatch({ batchId, items }) {
  return callJimengPortraitAi({
    action: 'submitBatch',
    batchId: batchId || '',
    items
  });
}

function retryPortraitTask(photoId, styleId) {
  return callJimengPortraitAi({
    action: 'retry',
    photoId,
    styleId
  });
}

/** 唤醒独立 Worker 消费 ai_tasks 队列 */
function kickPortraitWorker(options = {}) {
  const data = { action: 'run' };
  const batchId = options.batchId || '';
  if (batchId) data.priorityBatchId = batchId;

  return wx.cloud
    .callFunction({
      name: 'jimengPortraitWorker',
      data
    })
    .catch((err) => {
      console.warn('[jimengPortraitWorker] kick failed', err);
    });
}

async function pollPortraitPhoto(photoId, options = {}) {
  const db = wx.cloud.database();
  const { intervalMs = 3000, maxWaitMs = 600000, onTick } = options;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const res = await db.collection('photos').doc(photoId).get();
    const photo = res.data;
    if (!photo) {
      throw new Error('照片记录不存在');
    }
    const st = photo.generateStatus || 'pending';
    if (onTick) onTick(photo);
    if (st === 'completed' || (photo.isGenerated && photo.aiUrl)) {
      return photo;
    }
    if (st === 'failed') {
      const err = new Error(photo.errorMsg || '生成失败');
      throw err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('生成超时，请稍后在云相册查看');
}

function isPortraitGenerating(generateStatus) {
  return generateStatus === 'pending' || generateStatus === 'processing';
}

module.exports = {
  callJimengPortraitAi,
  submitPortraitTask,
  submitPortraitBatch,
  retryPortraitTask,
  kickPortraitWorker,
  pollPortraitPhoto,
  isPortraitGenerating
};
