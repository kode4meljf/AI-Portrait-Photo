const cloud = require('wx-server-sdk');
const { FRAME_POINTS, INSUFFICIENT_POINTS_MSG } = require('./points');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function chargeStoreForFrame(storeId) {
  const updateRes = await db
    .collection('stores')
    .where({
      _id: storeId,
      balance: _.gte(FRAME_POINTS)
    })
    .update({
      data: {
        balance: _.inc(-FRAME_POINTS),
        updateTime: db.serverDate()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    return { ok: false, error: INSUFFICIENT_POINTS_MSG };
  }
  return { ok: true, points: FRAME_POINTS };
}

async function refundStoreFrame(storeId, amount = FRAME_POINTS) {
  if (!storeId || !amount) return;
  await db
    .collection('stores')
    .doc(storeId)
    .update({
      data: {
        balance: _.inc(amount),
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
  refundStoreFrame
};
