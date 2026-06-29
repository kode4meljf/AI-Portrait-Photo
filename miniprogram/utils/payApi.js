function parsePayResult(res) {
  if (!res) throw new Error('payApi 无响应');
  const errMsg = res.errMsg || '';
  if (errMsg && !errMsg.includes('ok')) {
    if (errMsg.includes('FUNCTION_NOT_FOUND') || errMsg.includes('-501000')) {
      throw new Error('未找到云函数 payApi，请先上传部署');
    }
    if (errMsg.includes('-504002') || /functions execute fail/i.test(errMsg)) {
      throw new Error('充值服务异常，请确认云函数 payApi 已部署并重试');
    }
    throw new Error(errMsg);
  }
  const result = res.result || {};
  if (result.success === false) {
    const err = new Error(result.error || '操作失败');
    if (result.code) err.code = result.code;
    throw err;
  }
  return result.data;
}

function callPayApi(action, data = {}) {
  return wx.cloud
    .callFunction({ name: 'payApi', data: { action, ...data } })
    .then((res) => parsePayResult(res));
}

function fetchPayStatus() {
  return callPayApi('pay.status');
}

function fetchRechargePackages() {
  return callPayApi('packages.list').then((data) => data.packages || []);
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        if (res.code) resolve(res.code);
        else reject(new Error('获取 login code 失败'));
      },
      fail: reject
    });
  });
}

function createRechargeOrder(packageId) {
  return wxLogin().then((loginCode) =>
    callPayApi('recharge.create', { packageId, loginCode })
  );
}

function queryRechargeOrder(outTradeNo) {
  return callPayApi('recharge.query', { outTradeNo });
}

function cancelRechargeOrder(outTradeNo) {
  return callPayApi('recharge.cancel', { outTradeNo });
}

function requestVirtualPayment(virtualPayment) {
  return new Promise((resolve, reject) => {
    if (!wx.canIUse('requestVirtualPayment')) {
      reject(new Error('当前微信版本不支持虚拟支付，请升级微信'));
      return;
    }
    wx.requestVirtualPayment({
      signData: virtualPayment.signData,
      paySig: virtualPayment.paySig,
      signature: virtualPayment.signature,
      mode: virtualPayment.mode || 'short_series_goods',
      success: resolve,
      fail: reject
    });
  });
}

const PENDING_RECHARGE_STORAGE = 'pending_recharge_orders';
const PENDING_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const PENDING_MAX_ITEMS = 8;

function readPendingRecharges() {
  try {
    const raw = wx.getStorageSync(PENDING_RECHARGE_STORAGE);
    return Array.isArray(raw) ? raw : [];
  } catch (err) {
    return [];
  }
}

function writePendingRecharges(list) {
  wx.setStorageSync(PENDING_RECHARGE_STORAGE, list);
}

function savePendingRecharge({ outTradeNo, points }) {
  const no = String(outTradeNo || '').trim();
  if (!no) return;
  const now = Date.now();
  const next = readPendingRecharges()
    .filter((item) => item.outTradeNo !== no)
    .filter((item) => now - (item.createdAt || 0) < PENDING_MAX_AGE_MS);
  next.unshift({ outTradeNo: no, points: Number(points) || 0, createdAt: now });
  writePendingRecharges(next.slice(0, PENDING_MAX_ITEMS));
}

function removePendingRecharge(outTradeNo) {
  const no = String(outTradeNo || '').trim();
  if (!no) return;
  writePendingRecharges(readPendingRecharges().filter((item) => item.outTradeNo !== no));
}

async function syncPendingRechargeOrders() {
  const now = Date.now();
  const list = readPendingRecharges().filter((item) => now - (item.createdAt || 0) < PENDING_MAX_AGE_MS);
  if (!list.length) return { credited: 0, paidCount: 0 };

  let credited = 0;
  let paidCount = 0;
  const remain = [];

  for (const item of list) {
    try {
      const order = await queryRechargeOrder(item.outTradeNo);
      if (order.status === 'paid') {
        paidCount += 1;
        credited += Number(order.points || order.times || item.points || 0);
        continue;
      }
      remain.push(item);
    } catch (err) {
      console.warn('[payApi] syncPendingRechargeOrders', item.outTradeNo, err.message || err);
      remain.push(item);
    }
  }

  writePendingRecharges(remain.slice(0, PENDING_MAX_ITEMS));
  return { credited, paidCount };
}

function isIosPlatform() {
  try {
    return wx.getSystemInfoSync().platform === 'ios';
  } catch (err) {
    return false;
  }
}

module.exports = {
  callPayApi,
  fetchPayStatus,
  fetchRechargePackages,
  createRechargeOrder,
  queryRechargeOrder,
  cancelRechargeOrder,
  requestVirtualPayment,
  savePendingRecharge,
  removePendingRecharge,
  syncPendingRechargeOrders,
  isIosPlatform
};
