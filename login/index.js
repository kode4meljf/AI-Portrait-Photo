/**
 * @file 登录云函数
 * @description 获取用户openId，创建门店记录（如不存在）
 */

const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  // 检查门店是否存在
  const storeRes = await db.collection("store_profile").where({
    _id: openId
  }).get();

  if (storeRes.data.length === 0) {
    // 创建默认门店记录
    await db.collection("store_profile").add({
      data: {
        _id: openId,
        name: "AI写真馆",
        contactName: "",
        contactPhone: "",
        address: "",
        avatarUrl: "",
        level: "普通会员",
        balance: 100,
        packageTotal: 0,
        packageUsed: 0,
        packageExpireDate: null,
        createTime: db.serverDate()
      }
    });
  }

  return { openId };
};