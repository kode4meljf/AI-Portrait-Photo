const cloud = require('wx-server-sdk');
const submitAITask = require('./submitAITask');
const { resolveStoreIdFromOpenid } = require('../lib/resolveStoreMember');
const { PORTRAIT_COST } = require('./lib/balance');

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
    const storeRes = await db.collection('stores').doc(storeId).get();
    const balance = storeRes.data?.balance || 0;
    if (balance < PORTRAIT_COST) {
      return { success: false, error: '剩余次数不足，请先充值' };
    }

    return submitAITask.main({ photoId, styleId });
  } catch (err) {
    console.error('[jimengPortraitAi/retry] 失败:', err);
    return { success: false, error: err.message || '重试提交失败' };
  }
}

module.exports = { main };
