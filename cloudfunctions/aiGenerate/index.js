/**
 * @file AI生成云函数
 * @description 调用AI服务生成写真照片
 */

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const axios = require("axios");

exports.main = async (event) => {
  const { photoIds, batchId } = event;

  try {
    // 获取原始照片URL
    const photosRes = await db.collection("photos")
      .where({ _id: db.command.in(photoIds) })
      .get();
    const photoUrls = photosRes.data.map(p => p.originalUrl);

    // 调用AI服务（示例：云托管API）
    // const aiRes = await axios.post("https://your-ai-service.tcb.qcloud.la/generate", {
    //   images: photoUrls,
    //   style: "写真",
    //   quality: "high"
    // });

    // 模拟AI响应（实际需替换为真实API调用）
    const aiResultUrls = photoUrls.map(url => url.replace("original", "ai-generated"));

    // 更新照片的AI生成结果
    for (let i = 0; i < photoIds.length; i++) {
      await db.collection("photos").doc(photoIds[i]).update({
        data: {
          aiUrl: aiResultUrls[i],
          isGenerated: true,
          updateTime: db.serverDate()
        }
      });
    }

    // 生成成功后，更新批次状态
    const allPhotosRes = await db.collection("photos")
      .where({ batchId })
      .get();
    const allGenerated = allPhotosRes.data.every(p => p.isGenerated);

    if (allGenerated) {
      await db.collection("batches").doc(batchId).update({
        data: { status: "completed" }
      });
    }

    // 扣减客户剩余次数（如有客户关联）
    const firstPhoto = photosRes.data[0];
    if (firstPhoto.customerId) {
      await db.collection("customers").doc(firstPhoto.customerId).update({
        data: {
          equityAlbum: db.command.inc(-1)
        }
      });
    }

    return { success: true, aiUrls: aiResultUrls };
  } catch (error) {
    console.error("AI生成失败:", error);
    await db.collection("batches").doc(batchId).update({
      data: { status: "failed" }
    });
    return { success: false, error: error.message };
  }
};