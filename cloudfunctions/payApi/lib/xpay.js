const crypto = require('crypto');
const https = require('https');
const cloud = require('wx-server-sdk');
const { getPayConfig } = require('./config');

const VPAY_URI = 'requestVirtualPayment';
const QUERY_ORDER_URI = '/xpay/query_order';

/** 微信侧已支付及后续状态（2 待发货 / 3 发货中 / 4 已发货） */
const XPAY_PAID_STATUSES = new Set([2, 3, 4]);

function hmacSha256Hex(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest('hex');
}

function getAppKey(cfg) {
  return cfg.env === 1 ? cfg.appKeySandbox : cfg.appKeyProd;
}

function calcPaySig(uri, postBody, cfg) {
  return hmacSha256Hex(getAppKey(cfg), `${uri}&${postBody}`);
}

function calcVirtualPaymentSign(signData, sessionKey, cfg) {
  const appKey = getAppKey(cfg);
  return {
    paySig: hmacSha256Hex(appKey, `${VPAY_URI}&${signData}`),
    signature: hmacSha256Hex(sessionKey, signData)
  };
}

function buildGoodsSignData({ offerId, productId, goodsPrice, outTradeNo, attach, env }) {
  return JSON.stringify({
    offerId,
    buyQuantity: 1,
    env,
    currencyType: 'CNY',
    productId,
    goodsPrice,
    outTradeNo,
    attach
  });
}

function httpsPostJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Accept: 'application/json',
          'User-Agent': 'AI-Portrait-payApi/2.0'
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          let parsedBody = {};
          try {
            parsedBody = raw ? JSON.parse(raw) : {};
          } catch (e) {
            parsedBody = { raw };
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsedBody);
            return;
          }
          const err = new Error(parsedBody.errmsg || parsedBody.message || raw || `HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.response = parsedBody;
          reject(err);
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (e) {
            reject(new Error('解析微信接口响应失败'));
          }
        });
      })
      .on('error', reject);
  });
}

async function getAccessToken() {
  const res = await cloud.openapi.auth.getAccessToken();
  const token = res.access_token || (res.data && res.data.access_token);
  if (!token) {
    throw new Error(res.errmsg || res.errMsg || '获取 access_token 失败');
  }
  return token;
}

async function code2Session(jsCode, cfg) {
  const code = String(jsCode || '').trim();
  if (!code) {
    const err = new Error('缺少 login code');
    err.code = 'MISSING_LOGIN_CODE';
    throw err;
  }
  const appId = cfg.appId || cfg.runtimeAppId;
  const appSecret = cfg.appSecret;
  if (!appId || !appSecret) {
    const err = new Error('未配置 WX_APP_SECRET，无法换取 session_key');
    err.code = 'WX_APP_SECRET_NOT_CONFIGURED';
    throw err;
  }
  const url =
    'https://api.weixin.qq.com/sns/jscode2session' +
    `?appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';
  const res = await httpsGetJson(url);
  const errcode = res.errcode != null ? res.errcode : res.errCode;
  if (errcode) {
    const err = new Error(res.errmsg || res.errMsg || `login 失败(${errcode})`);
    err.code = errcode === 40029 ? 'LOGIN_CODE_INVALID' : 'LOGIN_FAILED';
    err.wxErrcode = errcode;
    throw err;
  }
  if (!res.session_key) {
    const err = new Error('session_key 为空');
    err.code = 'LOGIN_FAILED';
    throw err;
  }
  return res.session_key;
}

async function queryXpayOrder({ openid, outTradeNo, cfg }) {
  const postBody = JSON.stringify({
    openid,
    env: cfg.env,
    order_id: outTradeNo
  });
  const paySig = calcPaySig(QUERY_ORDER_URI, postBody, cfg);
  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com${QUERY_ORDER_URI}?access_token=${encodeURIComponent(accessToken)}&pay_sig=${encodeURIComponent(paySig)}`;
  const res = await httpsPostJson(url, postBody);
  if (res.errcode && res.errcode !== 0) {
    const err = new Error(res.errmsg || `查单失败(${res.errcode})`);
    err.code = 'XPAY_QUERY_FAILED';
    err.xpayErrcode = res.errcode;
    throw err;
  }
  return res.order || null;
}

function isXpayOrderPaid(order) {
  if (!order) return false;
  return XPAY_PAID_STATUSES.has(Number(order.status));
}

function resolveProductId(packageId, cfg) {
  const id = Number(packageId);
  const mapped = cfg.productIds[id];
  if (!mapped) {
    const err = new Error(`套餐 ${id} 未配置虚拟支付道具 ID，请在 xpay.config.json 中填写`);
    err.code = 'XPAY_PRODUCT_NOT_CONFIGURED';
    throw err;
  }
  return mapped;
}

function verifyXpayConfig(cfg) {
  const missing = [];
  if (!cfg.offerId) missing.push('XPAY_OFFER_ID');
  if (!cfg.appKeyProd) missing.push('XPAY_APP_KEY_PROD');
  if (!cfg.appKeySandbox) missing.push('XPAY_APP_KEY_SANDBOX');
  if (!cfg.appSecret) missing.push('WX_APP_SECRET');
  if (missing.length) {
    return {
      ok: false,
      message: `虚拟支付配置不完整：${missing.join('、')}`,
      code: 'XPAY_NOT_CONFIGURED'
    };
  }
  return {
    ok: true,
    message: '虚拟支付配置已就绪',
    env: cfg.env,
    offerId: cfg.offerId,
    productIds: cfg.productIds
  };
}

module.exports = {
  VPAY_URI,
  QUERY_ORDER_URI,
  XPAY_PAID_STATUSES,
  hmacSha256Hex,
  calcPaySig,
  calcVirtualPaymentSign,
  buildGoodsSignData,
  getAccessToken,
  code2Session,
  queryXpayOrder,
  isXpayOrderPaid,
  resolveProductId,
  verifyXpayConfig
};
