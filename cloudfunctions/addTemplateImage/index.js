// cloudfunctions/addTemplateImage/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  // 1. 获取所有模板
  const res = await db.collection('templates').get();
  const templates = res.data;

  // 2. 定义名称到图片 URL 的映射（请替换为您的真实 fileID）
  const nameToImageUrl = {
    '油画质感': 'cloud://net-cloud1-d6gv1m63z0a7c8c65.6e65-net-cloud1-d6gv1m63z0a7c8c65-1428059160/photos/凯旋门.jpeg',
    '杂志封面': 'cloud://net-cloud1-d6gv1m63z0a7c8c65.6e65-net-cloud1-d6gv1m63z0a7c8c65-1428059160/photos/凯旋门.jpeg',
    '古风唯美': 'cloud://net-cloud1-d6gv1m63z0a7c8c65.6e65-net-cloud1-d6gv1m63z0a7c8c65-1428059160/photos/凯旋门.jpeg',
    '法式浪漫': 'cloud://net-cloud1-d6gv1m63z0a7c8c65.6e65-net-cloud1-d6gv1m63z0a7c8c65-1428059160/photos/凯旋门.jpeg'
  };

  let updatedCount = 0;
  for (const t of templates) {
    const imageUrl = nameToImageUrl[t.name];
    if (imageUrl && !t.imageUrl) {
      await db.collection('templates').doc(t.id).update({
        data: { imageUrl }
      });
      updatedCount++;
    }
  }
  return { success: true, updatedCount, message: `已更新 ${updatedCount} 个模板的 imageUrl 字段` };
};









