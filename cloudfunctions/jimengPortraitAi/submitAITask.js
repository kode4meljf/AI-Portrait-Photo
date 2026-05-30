const cloud = require('wx-server-sdk');
const { resolveStoreIdFromOpenid } = require('../lib/resolveStoreMember');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STYLE_TEMPLATES_COLLECTION = 'style_templates';

async function main(event) {
  const { photoId, templateId } = event;
  if (!photoId || !templateId) {
    return { success: false, error: '缺少参数 photoId 或 templateId' };
  }

  try {
    const templateRes = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: templateId }).get();
    if (!templateRes.data.length) {
      return { success: false, error: '模板不存在' };
    }
    const template = templateRes.data[0];
    const prompt = template.prompt || '';
    if (!prompt) {
      return { success: false, error: '模板缺少 prompt' };
    }
    const resolution = template.resolution || '1024:1024';

    const storeId = await resolveStoreIdFromOpenid(cloud.getWXContext().OPENID);

    const task = {
      photoId,
      templateId,
      storeId,
      status: 'pending',
      engine: 'jimeng',
      prompt,
      resolution,
      jimengTaskId: null,
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
    return { success: false, error: err.message };
  }
}

module.exports = { main };
