const crypto = require('crypto');

function stripQuotes(value) {
  const s = String(value || '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function normalizePrivateKey(raw) {
  let key = stripQuotes(raw);
  if (!key) return '';

  key = key.replace(/\\n/g, '\n').replace(/\r/g, '').trim();

  if (!key.includes('BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(key)) {
    try {
      key = Buffer.from(key.replace(/\s/g, ''), 'base64').toString('utf8');
    } catch (e) {
      /* ignore */
    }
  }

  if (key.includes('BEGIN RSA PRIVATE KEY')) {
    try {
      const keyObject = crypto.createPrivateKey({ key, format: 'pem', type: 'pkcs1' });
      key = keyObject.export({ format: 'pem', type: 'pkcs8' }).toString();
    } catch (e) {
      console.warn('[payApi/credentials] pkcs1 convert failed', e.message);
    }
  }

  return key;
}

function normalizeSerialNo(raw) {
  return stripQuotes(raw).replace(/[\s:]/g, '').toUpperCase();
}

function validatePrivateKey(privateKey) {
  if (!privateKey) {
    return { ok: false, reason: 'WX_PAY_PRIVATE_KEY 为空' };
  }
  if (!/BEGIN (?:RSA )?PRIVATE KEY/.test(privateKey)) {
    return { ok: false, reason: '私钥格式不正确，需 apiclient_key.pem 全文' };
  }
  try {
    crypto.createPrivateKey(privateKey);
    const sig = crypto.createSign('RSA-SHA256').update('pay-api-self-test').sign(privateKey, 'base64');
    if (!sig) return { ok: false, reason: '私钥无法用于签名' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `私钥无效: ${e.message}` };
  }
}

function normalizePublicKey(raw) {
  return stripQuotes(raw).replace(/\\n/g, '\n').replace(/\r/g, '').trim();
}

function validateSerialNo(serialNo) {
  if (!serialNo) return { ok: false, reason: 'WX_PAY_SERIAL_NO 为空' };
  if (!/^[0-9A-Fa-f]{10,}$/.test(serialNo)) {
    return { ok: false, reason: '证书序列号格式异常（应为十六进制，无空格）' };
  }
  return { ok: true };
}

function extractCertSerialNo(certPem) {
  if (!certPem || !/BEGIN CERTIFICATE/.test(certPem)) return '';
  try {
    if (typeof crypto.X509Certificate === 'function') {
      const cert = new crypto.X509Certificate(certPem);
      return normalizeSerialNo(cert.serialNumber);
    }
  } catch (e) {
    console.warn('[payApi/credentials] parse cert failed', e.message);
  }
  return '';
}

function verifyPrivateKeyMatchesCert(privateKey, certPem) {
  if (!certPem) return { ok: null, reason: '未配置 WX_PAY_MERCHANT_CERT，跳过本地配对校验' };
  try {
    const message = 'ai-portrait-payapi-keypair-check';
    const signature = crypto.createSign('RSA-SHA256').update(message).sign(privateKey, 'base64');
    const publicKey = crypto.createPublicKey(certPem);
    const matched = crypto.createVerify('RSA-SHA256').update(message).verify(publicKey, signature, 'base64');
    return matched
      ? { ok: true, reason: '' }
      : { ok: false, reason: '私钥与商户证书(apiclient_cert.pem)不匹配' };
  } catch (e) {
    return { ok: false, reason: `证书/私钥配对校验失败: ${e.message}` };
  }
}

module.exports = {
  normalizePrivateKey,
  normalizePublicKey,
  normalizeSerialNo,
  validatePrivateKey,
  validateSerialNo,
  extractCertSerialNo,
  verifyPrivateKeyMatchesCert,
  stripQuotes
};
