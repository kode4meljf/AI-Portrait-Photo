const { stripQuotes } = require('./credentials');
const xpayFileConfig = require('../xpay.config.json');

/**
 * 小程序虚拟支付配置
 *
 * 道具 ID：见 payApi/xpay.config.json，部署后自动生效
 *
 * 云函数环境变量（敏感项仍走环境变量）：
 * XPAY_OFFER_ID           虚拟支付 OfferID（后台「基本配置」）
 * XPAY_APP_KEY_PROD       现网 AppKey
 * XPAY_APP_KEY_SANDBOX    沙箱 AppKey
 * XPAY_ENV                0 现网 / 1 沙箱（iOS 必须 0）
 * XPAY_MOCK=1             开发模拟支付（勿用于生产）
 * WX_APP_SECRET           小程序 AppSecret（code 换 session_key，auth.code2Session 不支持云调用）
 */

function readEnv(name) {
  return stripQuotes(process.env[name]);
}

function readProductIdsFromFile() {
  const raw = (xpayFileConfig && xpayFileConfig.productIds) || {};
  const ids = {};
  Object.keys(raw).forEach((key) => {
    const packageId = Number(key);
    const productId = String(raw[key] || '').trim();
    if (packageId && productId) ids[packageId] = productId;
  });
  return ids;
}

function getPayConfig(options = {}) {
  const runtimeAppId = options.runtimeAppId || '';
  const envRaw = readEnv('XPAY_ENV');
  const env = envRaw === '1' ? 1 : 0;

  return {
    appId: runtimeAppId,
    runtimeAppId,
    offerId: readEnv('XPAY_OFFER_ID'),
    appKeyProd: readEnv('XPAY_APP_KEY_PROD'),
    appKeySandbox: readEnv('XPAY_APP_KEY_SANDBOX'),
    appSecret: readEnv('WX_APP_SECRET'),
    env,
    productIds: readProductIdsFromFile(),
    mock: readEnv('XPAY_MOCK') === '1'
  };
}

function isPayConfigured(options = {}) {
  const c = getPayConfig(options);
  if (c.mock) return true;
  return !!(c.offerId && c.appKeyProd && c.appKeySandbox && c.appSecret);
}

function assertPayConfigured(options = {}) {
  if (!isPayConfigured(options)) {
    const err = new Error('虚拟支付尚未配置，请在 payApi 环境变量中填写 XPAY 参数及 WX_APP_SECRET');
    err.code = 'PAY_NOT_CONFIGURED';
    throw err;
  }
}

function getPayConfigSummary(options = {}) {
  const c = getPayConfig(options);
  return {
    configured: isPayConfigured(options),
    mock: c.mock,
    runtimeAppId: c.runtimeAppId || '',
    offerId: c.offerId ? `${c.offerId.slice(0, 4)}***` : '',
    env: c.env,
    productIds: c.productIds
  };
}

module.exports = {
  getPayConfig,
  isPayConfigured,
  assertPayConfigured,
  getPayConfigSummary
};
