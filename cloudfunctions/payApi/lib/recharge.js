const cloud = require('wx-server-sdk');
const { getPackageById, yuanToFen, listPackages } = require('./packages');
const { assertPayConfigured, getPayConfig } = require('./config');
const {
  createJsapiOrder,
  buildMiniProgramPayment,
  decryptNotifyResource,
  verifyNotifySignature
} = require('./wxpay');

const db = cloud.database();
const _ = db.command;

const ORDERS = 'recharge_orders';
const STORES = 'stores';

function buildOutTradeNo(storeId) {
  const tail = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return `rc_${storeId.replace(/^store_/, '').slice(0, 12)}_${tail}`.slice(0, 32);
}

async function createRechargeOrder(openid, storeId, packageId) {
  assertPayConfigured();
  const pkg = getPackageById(packageId);
  if (!pkg) {
    throw new Error('套餐不存在');
  }

  const cfg = getPayConfig();
  const amountFen = yuanToFen(pkg.price);
  const outTradeNo = buildOutTradeNo(storeId);
  const now = db.serverDate();

  const addRes = await db.collection(ORDERS).add({
    data: {
      outTradeNo,
      storeId,
      payerOpenId: openid,
      packageId: pkg.id,
      packageName: pkg.name,
      times: pkg.times,
      amountFen,
      expireDays: pkg.expireDays || 30,
      status: 'pending',
      transactionId: '',
      prepayId: '',
      paidAt: null,
      createTime: now,
      updateTime: now
    }
  });

  if (cfg.mock) {
    await fulfillRechargeOrder(outTradeNo, `mock_${Date.now()}`, amountFen);
    return {
      orderId: addRes._id,
      outTradeNo,
      mockPaid: true,
      times: pkg.times
    };
  }

  const prepayId = await createJsapiOrder({
    appId: cfg.appId,
    mchId: cfg.mchId,
    serialNo: cfg.serialNo,
    privateKey: cfg.privateKey,
    notifyUrl: cfg.notifyUrl,
    outTradeNo,
    description: `${pkg.name}-${pkg.times}人次`,
    amountFen,
    payerOpenId: openid
  });

  await db.collection(ORDERS).doc(addRes._id).update({
    data: {
      prepayId,
      updateTime: db.serverDate()
    }
  });

  const payment = buildMiniProgramPayment({
    appId: cfg.appId,
    prepayId,
    privateKey: cfg.privateKey
  });

  return {
    orderId: addRes._id,
    outTradeNo,
    payment,
    mockPaid: false
  };
}

async function fulfillRechargeOrder(outTradeNo, transactionId, paidFen) {
  const orderRes = await db.collection(ORDERS).where({ outTradeNo }).limit(1).get();
  if (!orderRes.data.length) {
    throw new Error('充值订单不存在');
  }
  const order = orderRes.data[0];

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
        balance: _.inc(row.times),
        packageTotal: row.times,
        packageUsed: 0,
        packageExpireDate: expireAt,
        updateTime: Date.now()
      }
    });
  });

  return { ok: true, duplicate: false, order };
}

async function queryRechargeOrder(openid, storeId, outTradeNo) {
  const no = String(outTradeNo || '').trim();
  if (!no) throw new Error('缺少订单号');

  const res = await db.collection(ORDERS).where({ outTradeNo: no, storeId }).limit(1).get();
  if (!res.data.length) {
    throw new Error('订单不存在');
  }
  const order = res.data[0];
  if (order.payerOpenId && order.payerOpenId !== openid) {
    throw new Error('无权查看该订单');
  }
  return {
    outTradeNo: order.outTradeNo,
    status: order.status,
    times: order.times,
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
      return { statusCode: 401, body: { code: 'FAIL', message: '签名校验失败' } };
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

  try {
    await fulfillRechargeOrder(
      decrypted.out_trade_no,
      decrypted.transaction_id,
      decrypted.amount && decrypted.amount.total
    );
  } catch (err) {
    console.error('[payApi] fulfill failed', err);
    if (/不可支付|金额/.test(err.message || '')) {
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
  fulfillRechargeOrder
};
