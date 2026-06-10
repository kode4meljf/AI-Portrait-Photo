const cloud = require('wx-server-sdk');
const { FRAME_POINTS, INSUFFICIENT_POINTS_MSG } = require('./points');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function chargeStoreForFrame(storeId) {
  return chargeStorePoints(storeId, FRAME_POINTS);
}

async function refundStoreFrame(storeId, amount = FRAME_POINTS) {
  return refundStorePoints(storeId, amount);
}

async function chargeStorePoints(storeId, amount) {
  const points = Math.max(1, Math.floor(Number(amount) || 0));
  const updateRes = await db
    .collection('stores')
    .where({
      _id: storeId,
      balance: _.gte(points)
    })
    .update({
      data: {
        balance: _.inc(-points),
        updateTime: db.serverDate()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    return { ok: false, error: INSUFFICIENT_POINTS_MSG };
  }
  return { ok: true, points };
}

async function refundStorePoints(storeId, amount) {
  const points = Math.max(0, Math.floor(Number(amount) || 0));
  if (!storeId || !points) return;
  await db
    .collection('stores')
    .doc(storeId)
    .update({
      data: {
        balance: _.inc(points),
        updateTime: db.serverDate()
      }
    })
    .catch((err) => {
      console.warn('[orderApi/balance] refund failed', err.message || err);
    });
}

module.exports = {
  FRAME_POINTS,
  INSUFFICIENT_POINTS_MSG,
  chargeStoreForFrame,
  refundStoreFrame,
  chargeStorePoints,
  refundStorePoints
};
