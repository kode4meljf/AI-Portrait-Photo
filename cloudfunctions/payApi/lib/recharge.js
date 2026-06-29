const cloud = require('wx-server-sdk');
const { getPackageById, yuanToFen, listPackages } = require('./packages');
const { assertPayConfigured, getPayConfig, isPayConfigured } = require('./config');
const {
  buildGoodsSignData,
  calcVirtualPaymentSign,
  code2Session,
  queryXpayOrder,
  isXpayOrderPaid,
  resolveProductId
} = require('./xpay');
const { normalizePushPayload, xpaySuccessResponse, xpayFailResponse } = require('./xpayNotify');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const ORDERS = 'recharge_orders';
const STORES = 'stores';
const VIRTUAL_PAYMENT_MODE = 'short_series_goods';

function buildOutTradeNo(storeId) {
  const tail = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return `rc_${storeId.replace(/^store_/, '').slice(0, 12)}_${tail}`.slice(0, 32);
}

function buildAttach(storeId, packageId) {
  const raw = JSON.stringify({ s: storeId, p: Number(packageId) });
  if (Buffer.byteLength(raw, 'utf8') > 128) {
    throw new Error('订单上下文过长');
  }
  return raw;
}

function toPublicOrder(order) {
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

async function createPendingOrder({
  outTradeNo,
  storeId,
  packageId,
  payerOpenId,
  pkg,
  amountFen,
  productId
}) {
  const points = pkg.points;
  const now = db.serverDate();
  await db.collection(ORDERS).add({
    data: {
      outTradeNo,
      storeId,
      payerOpenId: payerOpenId || '',
      packageId: pkg.id,
      packageName: pkg.name,
      points,
      times: points,
      amountFen,
      expireDays: pkg.expireDays || 365,
      xpayProductId: productId,
      status: 'pending',
      transactionId: '',
      paidAt: null,
      createTime: now,
      updateTime: now
    }
  });
}

async function fulfillPendingOrder(order, { transactionId, paidFen, productId }) {
  if (order.status === 'paid') {
    return { ok: true, duplicate: true, order };
  }
  if (order.status !== 'pending' && order.status !== 'cancelled') {
    throw new Error('订单状态不可支付');
  }
  if (Number(order.amountFen) !== Number(paidFen)) {
    throw new Error('支付金额与订单不一致');
  }
  if (productId && order.xpayProductId && productId !== order.xpayProductId) {
    throw new Error('道具 ID 与订单不一致');
  }

  const expireAt = new Date(Date.now() + (order.expireDays || 365) * 86400000);
  const points = order.points != null ? order.points : order.times;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.collection(ORDERS).doc(order._id).get();
    const row = snap.data;
    if (!row) throw new Error('充值订单不存在');
    if (row.status === 'paid') return;
    if (row.status !== 'pending' && row.status !== 'cancelled') throw new Error('订单状态不可支付');
    if (Number(row.amountFen) !== Number(paidFen)) {
      throw new Error('支付金额与订单不一致');
    }

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

  const fresh = await db.collection(ORDERS).where({ outTradeNo: order.outTradeNo }).limit(1).get();
  return { ok: true, duplicate: false, order: fresh.data[0] };
}

async function getPendingOrder(outTradeNo) {
  const res = await db.collection(ORDERS).where({ outTradeNo }).limit(1).get();
  return res.data && res.data[0] ? res.data[0] : null;
}

async function syncPaidFromXpay(openid, order, cfg) {
  if (!order || order.status === 'paid') return order;
  const remote = await queryXpayOrder({ openid, outTradeNo: order.outTradeNo, cfg });
  if (!isXpayOrderPaid(remote)) {
    if (remote) {
      console.log('[payApi] syncPaidFromXpay 未支付', {
        outTradeNo: order.outTradeNo,
        status: remote.status
      });
    }
    return order;
  }

  const paidFen = Number(remote.paid_fee != null ? remote.paid_fee : remote.order_fee) || order.amountFen;
  const result = await fulfillPendingOrder(order, {
    transactionId: remote.wxpay_order_id || remote.channel_order_id || '',
    paidFen,
    productId: order.xpayProductId
  });
  return result.order || order;
}

async function createRechargeOrder(openid, storeId, packageId, loginCode, options = {}) {
  assertPayConfigured(options);
  const pkg = await getPackageById(packageId);
  if (!pkg) {
    throw new Error('套餐不存在');
  }

  const cfg = getPayConfig(options);
  const amountFen = yuanToFen(pkg.price);
  const productId = resolveProductId(pkg.id, cfg);
  const outTradeNo = buildOutTradeNo(storeId);
  const attach = buildAttach(storeId, pkg.id);

  await createPendingOrder({
    outTradeNo,
    storeId,
    packageId: pkg.id,
    payerOpenId: openid,
    pkg,
    amountFen,
    productId
  });

  if (cfg.mock) {
    const pending = await getPendingOrder(outTradeNo);
    await fulfillPendingOrder(pending, {
      transactionId: `mock_${Date.now()}`,
      paidFen: amountFen,
      productId
    });
    return {
      outTradeNo,
      mockPaid: true,
      points: pkg.points,
      times: pkg.points,
      packageName: pkg.name
    };
  }

  const sessionKey = await code2Session(loginCode, cfg);
  const signData = buildGoodsSignData({
    offerId: cfg.offerId,
    productId,
    goodsPrice: amountFen,
    outTradeNo,
    attach,
    env: cfg.env
  });
  const { paySig, signature } = calcVirtualPaymentSign(signData, sessionKey, cfg);

  return {
    outTradeNo,
    mockPaid: false,
    points: pkg.points,
    times: pkg.points,
    packageName: pkg.name,
    virtualPayment: {
      signData,
      paySig,
      signature,
      mode: VIRTUAL_PAYMENT_MODE
    }
  };
}

async function queryRechargeOrder(openid, storeId, outTradeNo, options = {}) {
  const no = String(outTradeNo || '').trim();
  if (!no) throw new Error('缺少订单号');

  let res = await db.collection(ORDERS).where({ outTradeNo: no, storeId }).limit(1).get();
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

  let order = res.data[0];
  if (order.payerOpenId && order.payerOpenId !== openid) {
    throw new Error('无权查看该订单');
  }

  if (order.status === 'pending') {
    const cfg = getPayConfig(options);
    if (!cfg.mock && isPayConfigured(options)) {
      try {
        order = await syncPaidFromXpay(openid, order, cfg);
      } catch (err) {
        console.warn('[payApi] syncPaidFromXpay 失败', err.message || err, {
          outTradeNo: order.outTradeNo,
          code: err.code,
          xpayErrcode: err.xpayErrcode
        });
      }
    }
  }

  return toPublicOrder(order);
}

async function cancelRechargeOrder(openid, storeId, outTradeNo, options = {}) {
  const no = String(outTradeNo || '').trim();
  if (!no) throw new Error('缺少订单号');

  const res = await db.collection(ORDERS).where({ outTradeNo: no, storeId }).limit(1).get();
  if (!res.data.length) {
    return { outTradeNo: no, status: 'cancelled', points: 0, times: 0, amountFen: 0, packageName: '', paidAt: null };
  }

  let order = res.data[0];
  if (order.payerOpenId && order.payerOpenId !== openid) {
    throw new Error('无权操作该订单');
  }
  if (order.status === 'paid' || order.status === 'cancelled') {
    return toPublicOrder(order);
  }
  if (order.status !== 'pending') {
    throw new Error('订单状态不可取消');
  }

  const cfg = getPayConfig(options);
  if (!cfg.mock && isPayConfigured(options)) {
    try {
      order = await syncPaidFromXpay(openid, order, cfg);
      if (order.status === 'paid') {
        return toPublicOrder(order);
      }
    } catch (err) {
      console.warn('[payApi] cancelRechargeOrder syncPaidFromXpay 失败', err.message || err, {
        outTradeNo: no
      });
    }
  }

  await db.collection(ORDERS).doc(order._id).update({
    data: {
      status: 'cancelled',
      updateTime: db.serverDate()
    }
  });

  const fresh = await db.collection(ORDERS).doc(order._id).get();
  return toPublicOrder(fresh.data);
}

async function handleXpayPush(rawBody) {
  const payload = normalizePushPayload(rawBody);
  if (!payload) {
    return xpayFailResponse('无效推送', 400);
  }
  console.log('[payApi] xpay push payload', {
    event: payload.event,
    outTradeNo: payload.outTradeNo,
    productId: payload.productId,
    actualPriceFen: payload.actualPriceFen
  });
  if (payload.event !== 'xpay_goods_deliver_notify') {
    return xpaySuccessResponse();
  }
  if (!payload.outTradeNo) {
    return xpayFailResponse('缺少订单号', 400);
  }

  const order = await getPendingOrder(payload.outTradeNo);
  if (!order) {
    console.error('[payApi] xpay push: order not found', payload.outTradeNo);
    return xpayFailResponse('订单不存在', 404);
  }
  if (order.status === 'paid') {
    return xpaySuccessResponse();
  }

  const paidFen = payload.actualPriceFen || order.amountFen;
  try {
    await fulfillPendingOrder(order, {
      transactionId: payload.transactionId,
      paidFen,
      productId: payload.productId
    });
    return xpaySuccessResponse();
  } catch (err) {
    console.error('[payApi] xpay push fulfill failed', err);
    if (/金额|道具|状态/.test(err.message || '')) {
      return xpayFailResponse(err.message, 500);
    }
    return xpayFailResponse('入账失败', 500);
  }
}

module.exports = {
  listPackages,
  createRechargeOrder,
  queryRechargeOrder,
  cancelRechargeOrder,
  handleXpayPush
};
