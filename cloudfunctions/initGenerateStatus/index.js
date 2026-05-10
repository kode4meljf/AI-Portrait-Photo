// cloudfunctions/initGenerateStatus/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  try {
    // 获取所有照片（注意：一次最多获取 100 条，如果数据量很大需要分页循环）
    const countResult = await db.collection('photos').count();
    const total = countResult.total;
    const batchSize = 100;
    const batchTimes = Math.ceil(total / batchSize);

    let updatedCount = 0;
    for (let i = 0; i < batchTimes; i++) {
      const res = await db.collection('photos')
        .skip(i * batchSize)
        .limit(batchSize)
        .get();
      for (const photo of res.data) {
        if (!photo.generateStatus) {
          await db.collection('photos').doc(photo._id).update({
            data: { generateStatus: 'pending' }
          });
          updatedCount++;
        }
      }
    }
    return { success: true, message: `已更新 ${updatedCount} 条记录` };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message };
  }
};