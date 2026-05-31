const {
  normalizePrivateKey,
  normalizePublicKey,
  normalizeSerialNo,
  validatePrivateKey,
  validateSerialNo,
  extractCertSerialNo,
  verifyPrivateKeyMatchesCert,
  stripQuotes
} = require('./credentials');

/**
 * 微信支付配置（云函数环境变量）
 *
 * WX_PAY_APP_ID          小程序 AppID（可与运行时 APPID 不一致时以运行时为准）
 * WX_PAY_MCH_ID          商户号
 * WX_PAY_API_V3_KEY      APIv3 密钥（32 字节）
 * WX_PAY_SERIAL_NO       商户 API 证书序列号（与 apiclient_key.pem 成对）
 * WX_PAY_PRIVATE_KEY     apiclient_key.pem 全文（\\n 换行）
 * WX_PAY_NOTIFY_URL      支付回调 HTTPS（路由 /payApi）
 * WX_PAY_MERCHANT_CERT   可选：apiclient_cert.pem 全文，用于 pay.verify 本地配对诊断
 * WX_PAY_PLATFORM_PUBLIC_KEY  微信支付公钥 PEM（公钥模式下回调验签，在 API 安全 下载）
 * WX_PAY_NOTIFY_RELAX=1  回调验签失败仍尝试解密入账（仅排查时用，生产勿开）
 * WX_PAY_MOCK=1          开发模拟支付（勿用于生产）
 */

function readEnv(name) {
  return stripQuotes(process.env[name]);
}

function getPayConfig(options = {}) {
  const runtimeAppId = options.runtimeAppId || '';
  const configuredAppId = readEnv('WX_PAY_APP_ID');
  const appId = runtimeAppId || configuredAppId;

  return {
    appId,
    configuredAppId,
    runtimeAppId,
    appIdMismatch: !!(configuredAppId && runtimeAppId && configuredAppId !== runtimeAppId),
    mchId: readEnv('WX_PAY_MCH_ID'),
    apiV3Key: readEnv('WX_PAY_API_V3_KEY'),
    serialNo: normalizeSerialNo(readEnv('WX_PAY_SERIAL_NO')),
    privateKey: normalizePrivateKey(readEnv('WX_PAY_PRIVATE_KEY')),
    notifyUrl: readEnv('WX_PAY_NOTIFY_URL'),
    merchantCert: normalizePublicKey(readEnv('WX_PAY_MERCHANT_CERT')),
    platformPublicKey: normalizePublicKey(readEnv('WX_PAY_PLATFORM_PUBLIC_KEY')),
    notifyRelax: readEnv('WX_PAY_NOTIFY_RELAX') === '1',
    mock: readEnv('WX_PAY_MOCK') === '1'
  };
}

function isPayConfigured(options = {}) {
  const c = getPayConfig(options);
  if (c.mock) return true;
  return !!(c.appId && c.mchId && c.apiV3Key && c.serialNo && c.privateKey && c.notifyUrl);
}

function assertPayConfigured(options = {}) {
  if (!isPayConfigured(options)) {
    const err = new Error('微信支付尚未配置，请在 payApi 环境变量中填写商户信息');
    err.code = 'PAY_NOT_CONFIGURED';
    throw err;
  }
  const c = getPayConfig(options);
  const keyCheck = validatePrivateKey(c.privateKey);
  if (!keyCheck.ok) {
    const err = new Error(keyCheck.reason);
    err.code = 'PAY_BAD_PRIVATE_KEY';
    throw err;
  }
  const serialCheck = validateSerialNo(c.serialNo);
  if (!serialCheck.ok) {
    const err = new Error(serialCheck.reason);
    err.code = 'PAY_BAD_SERIAL';
    throw err;
  }
}

function getPayConfigSummary(options = {}) {
  const c = getPayConfig(options);
  const keyCheck = validatePrivateKey(c.privateKey);
  const serialCheck = validateSerialNo(c.serialNo);
  return {
    configured: isPayConfigured(options),
    mock: c.mock,
    appId: c.appId || '',
    configuredAppId: c.configuredAppId || '',
    runtimeAppId: c.runtimeAppId || '',
    appIdMismatch: c.appIdMismatch,
    mchId: c.mchId ? `${c.mchId.slice(0, 2)}***` : '',
    serialNo: c.serialNo ? `${c.serialNo.slice(0, 6)}...` : '',
    notifyUrl: c.notifyUrl || '',
    hasPlatformPublicKey: !!readEnv('WX_PAY_PLATFORM_PUBLIC_KEY'),
    privateKeyOk: keyCheck.ok,
    privateKeyReason: keyCheck.ok ? '' : keyCheck.reason,
    serialOk: serialCheck.ok,
    serialReason: serialCheck.ok ? '' : serialCheck.reason
  };
}

module.exports = {
  getPayConfig,
  isPayConfigured,
  assertPayConfigured,
  getPayConfigSummary
};
