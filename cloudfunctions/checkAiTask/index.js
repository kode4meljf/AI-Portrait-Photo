/**
 * @file 检查AI任务状态云函数
 * @description 轮询AI生成任务状态
 */

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const { batchId } = event;

  try {
    const batchRes = await db.collection("batches").doc(batchId).get();
    const batch = batchRes.data;

    if (batch.status === "completed") {
      return { status: "completed" };
    }
    if (batch.status === "failed") {
      return { status: "failed" };
    }

    // 检查批次下的所有照片是否都已生成
    const photosRes = await db.collection("photos")
      .where({ batchId })
      .get();
    const allGenerated = photosRes.data.every(p => p.isGenerated === true);
    const hasGenerated = photosRes.data.some(p => p.isGenerated === true);

    if (allGenerated) {
      await db.collection("batches").doc(batchId).update({
        data: { status: "completed", updateTime: db.serverDate() }
      });
      return { status: "completed" };
    }
    if (hasGenerated && !allGenerated) {
      return { status: "processing" };
    }
    return { status: "pending" };
  } catch (error) {
    console.error("检查任务失败:", error);
    return { status: "error", error: error.message };
  }
};