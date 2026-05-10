/**
 * @file 创建订单云函数
 */

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event) => {
  const {
    frameTemplateId,
    frameName,
    size,
    material,
    price,
    photos,
    customerId
  } = event;

  const wxContext = cloud.getWXContext();
  const storeId = wxContext.OPENID;

  try {
    // 扣减门店余额
    const storeRes = await db.collection("store_profile").doc(storeId).get();
    if (storeRes.data.balance < price) {
      return { success: false, error: "余额不足，请充值" };
    }

    await db.collection("store_profile").doc(storeId).update({
      data: { balance: db.command.inc(-price) }
    });

    // 扣减客户剩余相框次数
    if (customerId) {
      await db.collection("customers").doc(customerId).update({
        data: { equityFrame: db.command.inc(-1) }
      });
    }

    // 生成订单号
    const orderNo = `OR${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // 创建订单
    const orderRes = await db.collection("frame_orders").add({
      data: {
        orderNo,
        storeId,
        customerId: customerId || null,
        frameTemplateId,
        frameName,
        size,
        material,
        price,
        photos,
        status: "制作中",
        shippingNo: null,
        createTime: db.serverDate(),
        estimatedCompleteTime: new Date(Date.now() + 7 * 24 * 3600000)
      }
    });

    return { success: true, orderId: orderRes._id, orderNo };
  } catch (error) {
    console.error("创建订单失败:", error);
    return { success: false, error: error.message };
  }
};