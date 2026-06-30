const cloud = require('wx-server-sdk');
const { resolveStoreIdFromOpenid } = require('./lib/resolveStoreMember');
const { assertCanSubmitPortrait, INSUFFICIENT_BALANCE_MSG } = require('./lib/balance');
const { assertCurrentPortraitEngineReady } = require('./lib/platformPortraitConfig');

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

    const photoRes = await db.collection('photos').doc(photoId).get();
    if (!photoRes.data) {
      return { success: false, error: '照片不存在' };
    }
    const photo = photoRes.data;
    const batchId = String(photo.batchId || event.batchId || '').trim() || null;

    const storeId = await resolveStoreIdFromOpenid(cloud.getWXContext().OPENID);
    await assertCanSubmitPortrait(storeId);
    const portraitConfig = await assertCurrentPortraitEngineReady();
    const portraitEngine = portraitConfig.portraitEngine;

    const task = {
      photoId,
      styleId,
      storeId,
      batchId,
      status: 'pending',
      engine: portraitEngine,
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
    if (portraitEngine === 'seedream') {
      task.seedreamSizeTier = portraitConfig.seedreamSizeTier;
    }
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
      message: portraitEngine === 'seedream'
        ? '任务已提交（智绘引擎），请稍后刷新查看'
        : '任务已提交（经典引擎），请稍后刷新查看'
    };
  } catch (err) {
    console.error('[jimengPortraitAi/submit] 失败:', err);
    const message =
      err.code === 'INSUFFICIENT_BALANCE' ? INSUFFICIENT_BALANCE_MSG : err.message;
    return { success: false, error: message, code: err.code || '' };
  }
}

module.exports = { main };
