const cloud = require('wx-server-sdk');
const { getPackageById, yuanToFen, listPackages } = require('./packages');
const { assertPayConfigured, getPayConfig } = require('./config');
const {
  createJsapiOrder,
  buildMiniProgramPayment,
  decryptNotifyResource,
  verifyNotifySignature
} = require('./wxpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const ORDERS = 'recharge_orders';
const STORES = 'stores';

function buildOutTradeNo(storeId) {
  const tail = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return `rc_${storeId.replace(/^store_/, '').slice(0, 12)}_${tail}`.slice(0, 32);
}

/** 微信 attach 上限 128 字节；1.0 不落 pending，支付成功后再写库 */
function buildAttach(storeId, packageId) {
  const raw = JSON.stringify({ s: storeId, p: Number(packageId) });
  if (Buffer.byteLength(raw, 'utf8') > 128) {
    throw new Error('订单上下文过长');
  }
  return raw;
}

function parseAttach(attach) {
  if (!attach) throw new Error('缺少支付上下文');
  let parsed;
  try {
    parsed = JSON.parse(String(attach));
  } catch (e) {
    throw new Error('支付上下文无效');
  }
  const storeId = String(parsed.s || '').trim();
  const packageId = Number(parsed.p);
  if (!storeId || !packageId) throw new Error('支付上下文无效');
  return { storeId, packageId };
}

async function recordPaidRechargeOrder({
  outTradeNo,
  storeId,
  packageId,
  payerOpenId,
  transactionId,
  paidFen,
  pkg
}) {
  const resolvedPkg = pkg || (await getPackageById(packageId));
  if (!resolvedPkg) {
    throw new Error('套餐不存在');
  }
  if (Number(resolvedPkg.id) !== Number(packageId)) {
    throw new Error('套餐信息不一致');
  }

  const amountFen = yuanToFen(resolvedPkg.price);
  if (Number(amountFen) !== Number(paidFen)) {
    throw new Error('支付金额与订单不一致');
  }

  const points = resolvedPkg.points;
  const expireAt = new Date(Date.now() + (resolvedPkg.expireDays || 30) * 86400000);
  const now = db.serverDate();

  await db.runTransaction(async (transaction) => {
    const dupRes = await transaction.collection(ORDERS).where({ outTradeNo }).limit(1).get();
    const existing = dupRes.data && dupRes.data[0];
    if (existing) {
      if (existing.status === 'paid') return;
      throw new Error('订单状态不可支付');
    }

    await transaction.collection(ORDERS).add({
      data: {
        outTradeNo,
        storeId,
        payerOpenId: payerOpenId || '',
        packageId: resolvedPkg.id,
        packageName: resolvedPkg.name,
        points,
        times: points,
        amountFen,
        expireDays: resolvedPkg.expireDays || 30,
        status: 'paid',
        transactionId: transactionId || '',
        prepayId: '',
        paidAt: now,
        createTime: now,
        updateTime: now
      }
    });

    await transaction.collection(STORES).doc(storeId).update({
      data: {
        balance: _.inc(points),
        packageTotal: points,
        packageUsed: 0,
        packageExpireDate: expireAt,
        updateTime: Date.now()
      }
    });
  });

  const orderRes = await db.collection(ORDERS).where({ outTradeNo }).limit(1).get();
  return orderRes.data[0];
}

async function upgradeLegacyPendingOrder(order, transactionId, paidFen) {
  if (order.status === 'paid') {
    return { ok: true, duplicate: true, order };
  }
  if (order.status !== 'pending') {
    throw new Error('订单状态不可支付');
  }
  if (Number(order.amountFen) !== Number(paidFen)) {
    throw new Error('支付金额与订单不一致');
  }

  const expireAt = new Date(Date.now() + (order.expireDays || 30) * 86400000);
  const points = order.points != null ? order.points : order.times;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.collection(ORDERS).doc(order._id).get();
    const row = snap.data;
    if (!row) throw new Error('充值订单不存在');
    if (row.status === 'paid') return;
    if (row.status !== 'pending') throw new Error('订单状态不可支付');

    await transaction.collection(ORDERS).doc(order._id).update({
      data: {
        status: 'paid',
        transactionId: transactionId || '',
        paidAt: db.serverDate(),
        updateTime: db.serverDate()
      }
    });

    await transaction.collection(STORES).doc(row.storeId).update({
      data: {
        balance: _.inc(points),
        packageTotal: points,
        packageUsed: 0,
        packageExpireDate: expireAt,
        updateTime: Date.now()
      }
    });
  });

  return { ok: true, duplicate: false, order };
}

/**
 * 1.0：create 阶段不写库；仅 mock 或支付回调成功后写入 paid 订单。
 */
async function createRechargeOrder(openid, storeId, packageId, options = {}) {
  assertPayConfigured(options);
  const pkg = await getPackageById(packageId);
  if (!pkg) {
    throw new Error('套餐不存在');
  }

  const cfg = getPayConfig(options);
  if (cfg.appIdMismatch) {
    console.warn(
      '[payApi] WX_PAY_APP_ID 与当前小程序不一致，已使用运行时 APPID:',
      cfg.runtimeAppId
    );
  }

  const amountFen = yuanToFen(pkg.price);
  const outTradeNo = buildOutTradeNo(storeId);
  const attach = buildAttach(storeId, pkg.id);

  if (cfg.mock) {
    await recordPaidRechargeOrder({
      outTradeNo,
      storeId,
      packageId: pkg.id,
      payerOpenId: openid,
      transactionId: `mock_${Date.now()}`,
      paidFen: amountFen,
      pkg
    });
    return {
      outTradeNo,
      mockPaid: true,
      points: pkg.points,
      times: pkg.points,
      packageName: pkg.name
    };
  }

  const prepayId = await createJsapiOrder({
    appId: cfg.appId,
    mchId: cfg.mchId,
    serialNo: cfg.serialNo,
    privateKey: cfg.privateKey,
    notifyUrl: cfg.notifyUrl,
    outTradeNo,
    description: `${pkg.name}-${pkg.points}积分`,
    amountFen,
    payerOpenId: openid,
    attach
  }).catch((err) => {
    const wxMsg = (err.response && (err.response.message || err.response.code)) || err.message;
    console.error('[payApi] createJsapiOrder failed', wxMsg, err.response || '');
    const e = new Error(wxMsg || '微信下单失败');
    e.code = 'WX_PAY_ORDER_FAILED';
    throw e;
  });

  const payment = buildMiniProgramPayment({
    appId: cfg.appId,
    prepayId,
    privateKey: cfg.privateKey
  });

  return {
    outTradeNo,
    payment,
    mockPaid: false,
    points: pkg.points,
    times: pkg.points,
    packageName: pkg.name
  };
}

async function fulfillRechargeOrder(outTradeNo, transactionId, paidFen, attach, payerOpenId) {
  const orderRes = await db.collection(ORDERS).where({ outTradeNo }).limit(1).get();
  if (orderRes.data.length) {
    return upgradeLegacyPendingOrder(orderRes.data[0], transactionId, paidFen);
  }

  const { storeId, packageId } = parseAttach(attach);
  const order = await recordPaidRechargeOrder({
    outTradeNo,
    storeId,
    packageId,
    payerOpenId,
    transactionId,
    paidFen
  });

  return { ok: true, duplicate: false, order };
}

async function queryRechargeOrder(openid, storeId, outTradeNo) {
  const no = String(outTradeNo || '').trim();
  if (!no) throw new Error('缺少订单号');

  const res = await db.collection(ORDERS).where({ outTradeNo: no, storeId }).limit(1).get();
  if (!res.data.length) {
    return {
      outTradeNo: no,
      status: 'pending',
      points: 0,
      times: 0,
      amountFen: 0,
      packageName: '',
      paidAt: null
    };
  }

  const order = res.data[0];
  if (order.payerOpenId && order.payerOpenId !== openid) {
    throw new Error('无权查看该订单');
  }
  return {
    outTradeNo: order.outTradeNo,
    status: order.status,
    points: order.points != null ? order.points : order.times,
    times: order.points != null ? order.points : order.times,
    amountFen: order.amountFen,
    packageName: order.packageName,
    paidAt: order.paidAt || null
  };
}

async function handlePayNotify(httpEvent) {
  const cfg = getPayConfig();
  if (!cfg.apiV3Key) {
    return { statusCode: 500, body: { code: 'FAIL', message: '未配置支付' } };
  }

  const headers = httpEvent.headers || {};
  const timestamp = headers['wechatpay-timestamp'] || headers['Wechatpay-Timestamp'] || '';
  const nonce = headers['wechatpay-nonce'] || headers['Wechatpay-Nonce'] || '';
  const signature = headers['wechatpay-signature'] || headers['Wechatpay-Signature'] || '';
  const rawBody = typeof httpEvent.body === 'string' ? httpEvent.body : JSON.stringify(httpEvent.body || {});

  if (cfg.platformPublicKey) {
    const ok = verifyNotifySignature({
      timestamp,
      nonce,
      body: rawBody,
      signature,
      platformPublicKey: cfg.platformPublicKey
    });
    if (!ok) {
      console.error('[payApi] notify signature verify failed', {
        serial: headers['wechatpay-serial'] || headers['Wechatpay-Serial'] || '',
        hasPlatformKey: true
      });
      if (!cfg.notifyRelax) {
        return { statusCode: 401, body: { code: 'FAIL', message: '签名校验失败' } };
      }
      console.warn('[payApi] WX_PAY_NOTIFY_RELAX=1，跳过验签继续解密');
    }
  }

  let envelope = {};
  try {
    envelope = JSON.parse(rawBody);
  } catch (e) {
    return { statusCode: 400, body: { code: 'FAIL', message: '无效请求体' } };
  }

  const resource = envelope.resource || {};
  let decrypted;
  try {
    decrypted = decryptNotifyResource({
      ciphertext: resource.ciphertext,
      associatedData: resource.associated_data || '',
      nonce: resource.nonce,
      apiV3Key: cfg.apiV3Key
    });
  } catch (e) {
    console.error('[payApi] decrypt notify failed', e);
    return { statusCode: 400, body: { code: 'FAIL', message: '解密失败' } };
  }

  if (decrypted.trade_state !== 'SUCCESS') {
    return { statusCode: 200, body: { code: 'SUCCESS', message: '成功' } };
  }

  const payerOpenId =
    (decrypted.payer && decrypted.payer.openid) ||
    (decrypted.payer && decrypted.payer.sp_openid) ||
    '';

  try {
    await fulfillRechargeOrder(
      decrypted.out_trade_no,
      decrypted.transaction_id,
      decrypted.amount && decrypted.amount.total,
      decrypted.attach,
      payerOpenId
    );
  } catch (err) {
    console.error('[payApi] fulfill failed', err);
    if (/不可支付|金额|上下文|套餐/.test(err.message || '')) {
      return { statusCode: 500, body: { code: 'FAIL', message: err.message } };
    }
    if (/不存在/.test(err.message || '')) {
      return { statusCode: 404, body: { code: 'FAIL', message: err.message } };
    }
    return { statusCode: 500, body: { code: 'FAIL', message: '入账失败' } };
  }

  return { statusCode: 200, body: { code: 'SUCCESS', message: '成功' } };
}

module.exports = {
  listPackages,
  createRechargeOrder,
  queryRechargeOrder,
  handlePayNotify,
  fulfillRechargeOrder,
  recordPaidRechargeOrder
};
