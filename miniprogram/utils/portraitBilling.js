const app = getApp();
const db = wx.cloud.database();
const { getProfileCollection } = require('./account.js');
const { isValidStoreId } = require('./storeSession.js');
const {
  PORTRAIT_POINTS_SINGLE,
  PORTRAIT_POINTS_3,
  PORTRAIT_POINTS_9,
  FRAME_POINTS,
  INSUFFICIENT_POINTS_MSG,
  portraitPointsForStyleCount
} = require('./storePoints.js');

const RECHARGE_URL = '/packageStore/pages/profile/recharge/recharge';

async function fetchStoreBalance() {
  const storeId = app.globalData.storeId;
  if (!isValidStoreId(storeId)) return 0;
  try {
    const res = await db.collection(getProfileCollection()).doc(storeId).get();
    return res.data?.balance || 0;
  } catch (err) {
    console.warn('[portraitBilling] 读取积分失败', err);
    return 0;
  }
}

function portraitCostForCount(count) {
  return portraitPointsForStyleCount(count);
}

function isInsufficientBalanceError(err) {
  const msg = String((err && err.message) || err || '');
  return /INSUFFICIENT_BALANCE|剩余积分不足|积分不足|剩余次数不足|次数不足/i.test(msg);
}

function portraitFailPresentation(errorMsg) {
  const msg = String(errorMsg || '').trim();
  if (/剩余积分不足|剩余次数不足|INSUFFICIENT_BALANCE|积分不足|次数不足/i.test(msg)) {
    return {
      failLabel: '剩余积分不足',
      failHint: '请先充值后再重试'
    };
  }
  if (/生成超时|TIMEOUT/i.test(msg)) {
    return {
      failLabel: '生成超时',
      failHint: '点击右下角重新生成'
    };
  }
  return {
    failLabel: '生成失败',
    failHint: '点击右下角重新生成'
  };
}

async function promptInsufficientBalance(options = {}) {
  const balance = options.balance != null ? options.balance : await fetchStoreBalance();
  const required = Math.max(1, Number(options.required) || 1);
  const res = await wx.showModal({
    title: '剩余积分不足',
    content: `当前剩余 ${balance} 积分，本次需要 ${required} 积分。请先充值后再试。`,
    confirmText: '去充值',
    cancelText: '取消'
  });
  if (res.confirm) {
    wx.navigateTo({ url: RECHARGE_URL });
  }
  return false;
}

/** 余额不足时弹窗并抛错，足够时返回当前积分 */
async function assertStorePoints(requiredPoints) {
  const required = Math.max(1, Number(requiredPoints) || 1);
  const balance = await fetchStoreBalance();
  if (balance >= required) return balance;
  await promptInsufficientBalance({ balance, required });
  const err = new Error(INSUFFICIENT_POINTS_MSG);
  err.code = 'INSUFFICIENT_BALANCE';
  throw err;
}

async function assertPortraitBalance(styleCount) {
  return assertStorePoints(portraitPointsForStyleCount(styleCount));
}

function toastPortraitError(err, fallback = '操作失败') {
  const msg = String((err && err.message) || err || fallback);
  let title = fallback;
  if (isInsufficientBalanceError(msg)) {
    title = '剩余积分不足';
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
  PORTRAIT_POINTS_SINGLE,
  PORTRAIT_POINTS_3,
  PORTRAIT_POINTS_9,
  FRAME_POINTS,
  PORTRAIT_COST: PORTRAIT_POINTS_SINGLE,
  INSUFFICIENT_POINTS_MSG,
  RECHARGE_URL,
  fetchStoreBalance,
  portraitCostForCount,
  portraitPointsForStyleCount,
  isInsufficientBalanceError,
  portraitFailPresentation,
  promptInsufficientBalance,
  assertStorePoints,
  assertPortraitBalance,
  toastPortraitError
};
