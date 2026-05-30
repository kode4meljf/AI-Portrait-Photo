const cloud = require('wx-server-sdk');
const submitAITask = require('./submitAITask');
const { resolveStoreIdFromOpenid } = require('./lib/resolveStoreMember');
const {
  assertCanSubmitPortrait,
  chargeStoreForPortrait,
  INSUFFICIENT_BALANCE_MSG
} = require('./lib/balance');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function main(event) {
  const { photoId, styleId: inputStyleId } = event;
  if (!photoId) {
    return { success: false, error: '缺少参数 photoId' };
  }

  try {
    const photoRes = await db.collection('photos').doc(photoId).get();
    if (!photoRes.data) {
      return { success: false, error: '照片不存在' };
    }
    const photo = photoRes.data;
    if (photo.generateStatus !== 'failed') {
      return { success: false, error: '仅失败的照片可重试' };
    }

    const styleId = inputStyleId || photo.styleId;
    if (!styleId) {
      return { success: false, error: '缺少风格 styleId' };
    }

    const storeId = await resolveStoreIdFromOpenid(cloud.getWXContext().OPENID);
    await assertCanSubmitPortrait(storeId);

    const submitRes = await submitAITask.main({ photoId, styleId });
    if (!submitRes.success || !submitRes.taskId) {
      return submitRes;
    }
    await chargeStoreForPortrait(storeId, submitRes.taskId);
    return submitRes;
  } catch (err) {
    console.error('[jimengPortraitAi/retry] 失败:', err);
    const message =
      err.code === 'INSUFFICIENT_BALANCE' ? INSUFFICIENT_BALANCE_MSG : err.message || '重试提交失败';
    return { success: false, error: message, code: err.code || '' };
  }
}

module.exports = { main };
