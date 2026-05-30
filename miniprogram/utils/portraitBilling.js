const app = getApp();
const db = wx.cloud.database();
const { getProfileCollection } = require('./account.js');
const { isValidStoreId } = require('./storeSession.js');

const PORTRAIT_COST = 1;

async function fetchStoreBalance() {
  const storeId = app.globalData.storeId;
  if (!isValidStoreId(storeId)) return 0;
  try {
    const res = await db.collection(getProfileCollection()).doc(storeId).get();
    return res.data?.balance || 0;
  } catch (err) {
    console.warn('[portraitBilling] 读取余额失败', err);
    return 0;
  }
}

function portraitCostForCount(count) {
  const n = Number(count) || 1;
  return Math.max(1, n) * PORTRAIT_COST;
}

function toastPortraitError(err, fallback = '操作失败') {
  const msg = String((err && err.message) || err || fallback);
  let title = fallback;
  if (/剩余次数不足|次数不足/.test(msg)) {
    title = '剩余次数不足';
  } else if (/服务暂不可用|请联系平台/.test(msg)) {
    title = '服务暂不可用';
  } else if (/生成失败|重试/.test(msg)) {
    title = msg.length > 14 ? '生成失败' : msg;
  } else if (msg.length <= 14) {
    title = msg;
  }
  wx.showToast({ title, icon: 'none' });
}

module.exports = {
  PORTRAIT_COST,
  fetchStoreBalance,
  portraitCostForCount,
  toastPortraitError
};
