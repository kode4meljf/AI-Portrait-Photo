// cloudfunctions/fixTemplateIds/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  // 名称到目标 _id 的映射
  const nameToId = {
    '油画质感': '1',
    '杂志封面': '2',
    '古风唯美': '3',
    '法式浪漫': '4'
  };

  // 获取所有模板
  const res = await db.collection('templates').get();
  const templates = res.data;
  let updatedCount = 0;

  for (const template of templates) {
    const targetId = nameToId[template.name];
    if (!targetId) {
      console.log(`未找到名称 ${template.name} 的映射，跳过`);
      continue;
    }

    // 如果当前 _id 已经是目标值，跳过
    if (template._id === targetId) {
      console.log(`模板 ${template.name} 的 _id 已经是 ${targetId}，跳过`);
      continue;
    }

    // 创建新文档（使用目标 _id）
    const newDoc = { ...template, _id: targetId };
    delete newDoc._id; // 避免冲突，先删除原 _id 字段，然后使用 doc(targetId).set
    await db.collection('templates').doc(targetId).set({ data: newDoc });
    console.log(`已创建新文档 _id: ${targetId}，名称: ${template.name}`);

    // 删除旧文档
    await db.collection('templates').doc(template._id).remove();
    console.log(`已删除旧文档 _id: ${template._id}`);

    updatedCount++;
  }

  return { success: true, updatedCount };
};