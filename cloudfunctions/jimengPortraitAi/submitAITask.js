const cloud = require('wx-server-sdk');
const { resolveStoreIdFromOpenid } = require('./lib/resolveStoreMember');
const { assertCanSubmitPortrait, INSUFFICIENT_BALANCE_MSG } = require('./lib/balance');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STYLE_TEMPLATES_COLLECTION = 'style_templates';

async function main(event) {
  const { photoId, styleId } = event;
  if (!photoId || !styleId) {
    return { success: false, error: '缺少参数 photoId 或 styleId' };
  }

  try {
    const styleRes = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: styleId }).get();
    if (!styleRes.data.length) {
      return { success: false, error: '风格不存在' };
    }
    const style = styleRes.data[0];
    const prompt = style.prompt || '';
    if (!prompt) {
      return { success: false, error: '风格缺少 prompt' };
    }
    const resolution = style.resolution || '1536:1152';

    const storeId = await resolveStoreIdFromOpenid(cloud.getWXContext().OPENID);
    await assertCanSubmitPortrait(storeId);

    const task = {
      photoId,
      styleId,
      storeId,
      status: 'pending',
      engine: 'jimeng',
      prompt,
      resolution,
      jimengTaskId: null,
      charged: false,
      chargeAmount: 0,
      createTime: new Date(),
      updateTime: new Date(),
      resultFileID: null,
      errorMsg: null
    };
    const addRes = await db.collection('ai_tasks').add({ data: task });

    try {
      await db.collection('photos').doc(photoId).update({
        data: {
          generateStatus: 'pending',
          isGenerated: false,
          errorMsg: null,
          updateTime: new Date()
        }
      });
    } catch (photoErr) {
      try {
        await db.collection('ai_tasks').doc(addRes._id).remove();
      } catch (rollbackErr) {
        console.warn('[jimengPortraitAi/submit] rollback failed', rollbackErr.message || rollbackErr);
      }
      throw photoErr;
    }

    return {
      success: true,
      taskId: addRes._id,
      message: '任务已提交（即梦），请稍后刷新查看'
    };
  } catch (err) {
    console.error('[jimengPortraitAi/submit] 失败:', err);
    const message =
      err.code === 'INSUFFICIENT_BALANCE' ? INSUFFICIENT_BALANCE_MSG : err.message;
    return { success: false, error: message, code: err.code || '' };
  }
}

module.exports = { main };
