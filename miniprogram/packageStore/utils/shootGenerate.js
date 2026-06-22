/**
 * 拍摄主链路：原图上传、建 batch/photos、提交即梦、轮询成片
 */
const app = getApp();
const db = wx.cloud.database();
const { createShootBatch, uploadShootOriginalToCloud, isWechatLocalPath } = require('../../utils/media.js');
const { isValidStoreId } = require('../../utils/storeSession.js');
const { submitPortraitBatch, kickPortraitWorker, isPortraitGenerating } = require('../../utils/jimengPortraitAi.js');
const { portraitFailPresentation } = require('../../utils/portraitBilling.js');

async function ensureCloudOriginalUrl(originalUrl) {
  const src = String(originalUrl || '').trim();
  if (!src) throw new Error('缺少原图');
  if (src.startsWith('cloud://')) return src;
  if (isWechatLocalPath(src)) {
    return uploadShootOriginalToCloud(src);
  }
  throw new Error('原图须为本地临时路径或 cloud:// 文件');
}

/**
 * 同一原图创建 1 个 batch + N 条 photos（每风格一条）
 * @param {string} cloudOriginalUrl
 * @param {Array<{id:string,name:string}>} styles
 */
async function createPhotosForStyles(cloudOriginalUrl, styles) {
  const storeId = app.globalData.storeId;
  if (!isValidStoreId(storeId)) {
    throw new Error('门店ID无效，请重新登录门店');
  }
  const customerId = app.globalData.selectedCustomerId || null;
  const batchId = await createShootBatch();
  const jobs = [];
  const photoFileIds = [];

  for (const style of styles) {
    const addRes = await db.collection('photos').add({
      data: {
        batchId,
        storeId,
        customerId,
        styleId: style.id,
        styleName: style.name || '',
        originalUrl: cloudOriginalUrl,
        aiUrl: null,
        isGenerated: false,
        isFavorite: false,
        generateStatus: 'pending',
        createTime: db.serverDate()
      }
    });
    jobs.push({
      photoId: addRes._id,
      styleId: style.id,
      styleName: style.name || ''
    });
    photoFileIds.push(cloudOriginalUrl);
  }

  await db.collection('batches').doc(batchId).update({
    data: {
      status: 'generating',
      photoIds: photoFileIds,
      requestedStyleCount: styles.length
    }
  });

  return { batchId, jobs };
}

async function submitAllPortraitTasks(jobs, batchId) {
  if (!jobs || !jobs.length) return;
  await submitPortraitBatch({
    batchId: batchId || '',
    items: jobs.map((job) => ({
      photoId: job.photoId,
      styleId: job.styleId
    }))
  });
  await kickPortraitWorker({ batchId: batchId || '' });
}

/**
 * 轮询 N 条 photos 直至全部 completed / failed 或超时
 */
async function pollShootPhotos(jobs, options = {}) {
  const { onProgress, onPollTick, intervalMs = 3000, maxWaitMs = 600000 } = options;
  const photoIds = jobs.map((j) => j.photoId);
  const deadline = Date.now() + maxWaitMs;
  const cmd = db.command;

  while (Date.now() < deadline) {
    const res = await db.collection('photos').where({ _id: cmd.in(photoIds) }).get();
    const map = {};
    (res.data || []).forEach((p) => {
      map[p._id] = p;
    });

    let completed = 0;
    let failed = 0;
    let generating = 0;

    photoIds.forEach((id) => {
      const p = map[id];
      if (!p) return;
      const st = p.generateStatus || 'pending';
      if (st === 'completed' || (p.isGenerated && p.aiUrl)) completed += 1;
      else if (st === 'failed') failed += 1;
      else if (isPortraitGenerating(st)) generating += 1;
    });

    if (onProgress) {
      onProgress({ completed, failed, generating, total: photoIds.length });
    }
    if (onPollTick) {
      onPollTick({ completed, failed, generating, total: photoIds.length });
    }

    if (completed + failed >= photoIds.length) {
      return jobs.map((job) => {
        const photo = map[job.photoId];
        if (!photo) {
          return { ...job, photo: null, failed: true, errorMsg: '照片记录不存在' };
        }
        const st = photo.generateStatus || '';
        const ok = st === 'completed' || (photo.isGenerated && photo.aiUrl);
        return {
          ...job,
          photo,
          failed: !ok,
          errorMsg: photo.errorMsg || ''
        };
      });
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error('生成超时，请稍后在云相册查看');
}

/** 小程序 image 可直接使用 cloud://；https 外链原样返回 */
function photoDisplayUrl(photo) {
  if (!photo) return '';
  return photo.aiUrl || photo.originalUrl || '';
}

/**
 * 完整拍摄生成流程（方案 B：在结果页调用）
 */
async function runShootPortraitGeneration(originalUrl, styles, options = {}) {
  if (!styles || !styles.length) {
    throw new Error('未选择风格');
  }

  const cloudOriginalUrl = await ensureCloudOriginalUrl(originalUrl);
  const { batchId, jobs } = await createPhotosForStyles(cloudOriginalUrl, styles);
  if (options.onBatchCreated) {
    options.onBatchCreated(batchId);
  }
  await submitAllPortraitTasks(jobs, batchId);

  let lastWorkerKickAt = Date.now();

  const polled = await pollShootPhotos(jobs, {
    intervalMs: options.intervalMs || 3000,
    maxWaitMs: options.maxWaitMs || 600000,
    onProgress: options.onProgress,
    onPollTick: ({ completed, failed, total }) => {
      const remaining = total - completed - failed;
      if (remaining > 0 && Date.now() - lastWorkerKickAt > 12000) {
        kickPortraitWorker({ batchId });
        lastWorkerKickAt = Date.now();
      }
    }
  });

  const succeeded = polled.filter((item) => !item.failed && item.photo && item.photo.aiUrl);
  const failedItems = polled.filter((item) => item.failed);

  await db.collection('batches').doc(batchId).update({
    data: { status: failedItems.length ? (succeeded.length ? 'partial' : 'failed') : 'completed' }
  }).catch(() => {});

  const results = polled.map((item) => {
    const ok = !item.failed && item.photo && item.photo.aiUrl;
    const failMeta = ok ? {} : portraitFailPresentation(item.errorMsg);
    return {
      id: item.styleId,
      name: item.styleName,
      url: ok ? photoDisplayUrl(item.photo) : photoDisplayUrl(item.photo),
      photoId: item.photoId,
      styleId: item.styleId,
      status: ok ? 'success' : 'failed',
      errorMsg: item.errorMsg || '',
      ...failMeta,
      imageMode: 'portrait',
      aspectRatio: 3 / 4
    };
  });

  return {
    batchId,
    results,
    failedCount: failedItems.length,
    cloudOriginalUrl
  };
}

module.exports = {
  ensureCloudOriginalUrl,
  createPhotosForStyles,
  submitAllPortraitTasks,
  pollShootPhotos,
  photoDisplayUrl,
  runShootPortraitGeneration
};
