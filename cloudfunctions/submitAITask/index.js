const cloud = require('wx-server-sdk');
const { resolveStoreIdFromOpenid } = require('../lib/resolveStoreMember');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STYLE_TEMPLATES_COLLECTION = 'style_templates';

exports.main = async (event, context) => {
  const { photoId, templateId } = event;
  if (!photoId || !templateId) {
    return { success: false, error: '缺少参数 photoId 或 templateId' };
  }

  try {
    // 验证模板是否存在（使用 id 字段，而非 _id）
    const templateRes = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: templateId }).get();
    if (templateRes.data.length === 0) {
      return { success: false, error: '模板不存在' };
    }

    const storeId = await resolveStoreIdFromOpenid(cloud.getWXContext().OPENID);

    // 创建任务记录
    const task = {
      photoId,
      templateId,
      storeId,
      status: 'pending',
      createTime: new Date(),
      updateTime: null,
      resultFileID: null,
      errorMsg: null
    };
    const addRes = await db.collection('ai_tasks').add({ data: task });

    // 更新照片状态为“等待处理”
    await db.collection('photos').doc(photoId).update({
      data: {
        generateStatus: 'pending',
        isGenerated: false,
        updateTime: new Date()
      }
    });

    return { success: true, taskId: addRes._id, message: '任务已提交，请稍后刷新查看' };
  } catch (err) {
    console.error('提交任务失败:', err);
    return { success: false, error: err.message };
  }
};