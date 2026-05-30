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
  const signature = crypto.createSign('RSA-SHA256').update(payload).sign(privateKey, 'base64');
  const authorization = [
    'WECHATPAY2-SHA256-RSA2048',
    `mchid="${mchId}"`,
    `nonce_str="${nonceStr}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${serialNo}"`
  ].join(', ');
  return { authorization, timestamp, nonceStr };
}

function httpsRequest({ method, path, body, headers }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        port: 443,
        path,
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'AI-Portrait-payApi/1.0',
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
  if (!platformPublicKey) return true;
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  return crypto.createVerify('RSA-SHA256').update(message).verify(platformPublicKey, signature, 'base64');
}

module.exports = {
  createJsapiOrder,
  buildMiniProgramPayment,
  decryptNotifyResource,
  verifyNotifySignature
};
