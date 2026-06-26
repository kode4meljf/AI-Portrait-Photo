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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitRechargePaid(outTradeNo, options = {}) {
  const maxAttempts = options.maxAttempts || 20;
  const intervalMs = options.intervalMs || 1500;
  for (let i = 0; i < maxAttempts; i += 1) {
    const order = await queryRechargeOrder(outTradeNo);
    if (order.status === 'paid') return order;
    await sleep(intervalMs);
  }
  throw new Error('支付结果确认中，请稍后在「我的」查看余额');
}

module.exports = {
  callPayApi,
  fetchPayStatus,
  fetchRechargePackages,
  createRechargeOrder,
  queryRechargeOrder,
  requestVirtualPayment,
  waitRechargePaid
};
