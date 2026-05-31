const crypto = require('crypto');
const https = require('https');

const API_HOST = 'api.mch.weixin.qq.com';

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function buildAuthorization({ method, canonicalUrl, body, mchId, serialNo, privateKey }) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomHex(16);
  const payload = `${method}\n${canonicalUrl}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(payload, 'utf8')
    .sign(privateKey, 'base64');
  const tokenParams = [
    `mchid="${mchId}"`,
    `nonce_str="${nonceStr}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${serialNo}"`
  ].join(',');
  const authorization = `WECHATPAY2-SHA256-RSA2048 ${tokenParams}`;
  return { authorization, timestamp, nonceStr };
}

function httpsRequest({ method, path, body, headers }) {
  return new Promise((resolve, reject) => {
    const baseHeaders = {
      Accept: 'application/json',
      'User-Agent': 'AI-Portrait-payApi/1.0'
    };
    if (method !== 'GET' && body) {
      baseHeaders['Content-Type'] = 'application/json';
    }
    const req = https.request(
      {
        hostname: API_HOST,
        port: 443,
        path,
        method,
        headers: {
          ...baseHeaders,
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch (e) {
            parsed = { raw };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
            return;
          }
          const msg = parsed.message || parsed.code || raw || `HTTP ${res.statusCode}`;
          const err = new Error(msg);
          err.statusCode = res.statusCode;
          err.response = parsed;
          reject(err);
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function createJsapiOrder({
  appId,
  mchId,
  serialNo,
  privateKey,
  notifyUrl,
  outTradeNo,
  description,
  amountFen,
  payerOpenId
}) {
  const path = '/v3/pay/transactions/jsapi';
  const requestBody = {
    appid: appId,
    mchid: mchId,
    description,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    amount: {
      total: amountFen,
      currency: 'CNY'
    },
    payer: {
      openid: payerOpenId
    }
  };
  const body = JSON.stringify(requestBody);
  const { authorization } = buildAuthorization({
    method: 'POST',
    canonicalUrl: path,
    body,
    mchId,
    serialNo,
    privateKey
  });

  const res = await httpsRequest({
    method: 'POST',
    path,
    body,
    headers: { Authorization: authorization }
  });

  if (!res.prepay_id) {
    throw new Error(res.message || '微信下单失败');
  }
  return res.prepay_id;
}

function buildMiniProgramPayment({ appId, prepayId, privateKey }) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomHex(16);
  const packageValue = `prepay_id=${prepayId}`;
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  const paySign = crypto.createSign('RSA-SHA256').update(message).sign(privateKey, 'base64');
  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign
  };
}

function decryptNotifyResource({ ciphertext, associatedData, nonce, apiV3Key }) {
  const key = Buffer.from(apiV3Key, 'utf8');
  const buf = Buffer.from(ciphertext, 'base64');
  const authTag = buf.slice(buf.length - 16);
  const data = buf.slice(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
  if (associatedData) {
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

function verifyNotifySignature({ timestamp, nonce, body, signature, platformPublicKey }) {
  if (!platformPublicKey || !signature) return false;
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  try {
    return crypto.createVerify('RSA-SHA256').update(message).verify(platformPublicKey, signature, 'base64');
  } catch (e) {
    console.error('[payApi] verify notify signature error', e.message);
    return false;
  }
}

async function verifyMerchantCredentials(cfg) {
  const localChecks = {
    keyPairOk: null,
    keyPairReason: '',
    certSerialNo: '',
    serialMatchesCert: null
  };

  if (cfg.merchantCert) {
    const pair = verifyPrivateKeyMatchesCert(cfg.privateKey, cfg.merchantCert);
    localChecks.keyPairOk = pair.ok;
    localChecks.keyPairReason = pair.reason;
    localChecks.certSerialNo = extractCertSerialNo(cfg.merchantCert);
    if (localChecks.certSerialNo) {
      localChecks.serialMatchesCert = localChecks.certSerialNo === cfg.serialNo;
    }
    if (pair.ok === false) {
      return {
        ok: false,
        message: pair.reason,
        code: 'LOCAL_KEYPAIR_MISMATCH',
        hints: ['请重新下载证书包，确保 apiclient_key.pem 与 apiclient_cert.pem 成对'],
        ...localChecks
      };
    }
    if (localChecks.serialMatchesCert === false) {
      return {
        ok: false,
        message: `证书序列号不一致，请将 WX_PAY_SERIAL_NO 改为 ${localChecks.certSerialNo}`,
        code: 'LOCAL_SERIAL_MISMATCH',
        hints: ['商户平台 → API安全 → 商户API证书 → 查看证书序列号'],
        ...localChecks
      };
    }
  }

  const path = '/v3/certificates';
  const body = '';
  const { authorization } = buildAuthorization({
    method: 'GET',
    canonicalUrl: path,
    body,
    mchId: cfg.mchId,
    serialNo: cfg.serialNo,
    privateKey: cfg.privateKey
  });

  try {
    await httpsRequest({
      method: 'GET',
      path,
      body: '',
      headers: { Authorization: authorization }
    });
    return {
      ok: true,
      message: '商户证书签名通过（已连通微信支付 API）',
      mode: 'platform_cert',
      ...localChecks
    };
  } catch (err) {
    const msg = (err.response && err.response.message) || err.message || '验签失败';
    const code = (err.response && err.response.code) || '';

    // 公钥模式下 /v3/certificates 不可用，但能走到业务错误说明 Authorization 已通过
    if (
      code === 'RESOURCE_NOT_EXISTS' &&
      /微信支付公钥|平台证书/.test(msg)
    ) {
      return {
        ok: true,
        message: '商户签名已通过（微信支付公钥模式，无需下载平台证书）',
        mode: 'wechatpay_public_key',
        notifyHint:
          '请在商户平台 API 安全 下载「微信支付公钥」，填入 WX_PAY_PLATFORM_PUBLIC_KEY 用于支付回调验签',
        ...localChecks
      };
    }

    const hints = [];
    if (!cfg.merchantCert) {
      hints.push('建议新增 WX_PAY_MERCHANT_CERT=apiclient_cert.pem 全文以便本地配对诊断');
    }
    if (code === 'SIGN_ERROR') {
      hints.push('请确认商户号、证书序列号、apiclient_key.pem 来自同一次「申请商户API证书」');
    }
    return {
      ok: false,
      message: msg,
      code,
      hints,
      ...localChecks
    };
  }
}

module.exports = {
  createJsapiOrder,
  buildMiniProgramPayment,
  decryptNotifyResource,
  verifyNotifySignature,
  verifyMerchantCredentials
};
