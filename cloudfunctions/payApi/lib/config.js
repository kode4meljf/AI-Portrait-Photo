/**
 * 微信支付配置（云函数环境变量）
 *
 * WX_PAY_APP_ID          小程序 AppID
 * WX_PAY_MCH_ID          商户号
 * WX_PAY_API_V3_KEY      APIv3 密钥（32 字节）
 * WX_PAY_SERIAL_NO       商户 API 证书序列号
 * WX_PAY_PRIVATE_KEY     apiclient_key.pem 全文（\\n 换行）
 * WX_PAY_NOTIFY_URL      支付回调 HTTPS 地址（见下方说明，勿写在 config.json 触发器里）
 * WX_PAY_PLATFORM_PUBLIC_KEY  微信平台公钥 PEM（验回调签，可选但建议）
 * WX_PAY_MOCK=1          开发模拟：跳过微信，直接入账（勿用于生产）
 */

function readEnv(name) {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : '';
}

function readPem(name) {
  return readEnv(name).replace(/\\n/g, '\n');
}

function getPayConfig() {
  return {
    appId: readEnv('WX_PAY_APP_ID'),
    mchId: readEnv('WX_PAY_MCH_ID'),
    apiV3Key: readEnv('WX_PAY_API_V3_KEY'),
    serialNo: readEnv('WX_PAY_SERIAL_NO'),
    privateKey: readPem('WX_PAY_PRIVATE_KEY'),
    notifyUrl: readEnv('WX_PAY_NOTIFY_URL'),
    platformPublicKey: readPem('WX_PAY_PLATFORM_PUBLIC_KEY'),
    mock: readEnv('WX_PAY_MOCK') === '1'
  };
}

function isPayConfigured() {
  const c = getPayConfig();
  if (c.mock) return true;
  return !!(c.appId && c.mchId && c.apiV3Key && c.serialNo && c.privateKey && c.notifyUrl);
}

function assertPayConfigured() {
  if (!isPayConfigured()) {
    const err = new Error('微信支付尚未配置，请联系管理员在云函数 payApi 环境变量中填写商户信息');
    err.code = 'PAY_NOT_CONFIGURED';
    throw err;
  }
}

module.exports = {
  getPayConfig,
  isPayConfigured,
  assertPayConfigured
};
