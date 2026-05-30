const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const FRAME_COST = 1;

async function chargeStoreForFrame(storeId) {
  const updateRes = await db
    .collection('stores')
    .where({
      _id: storeId,
      balance: _.gte(FRAME_COST)
    })
    .update({
      data: {
        balance: _.inc(-FRAME_COST),
        updateTime: db.serverDate()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    return { ok: false, error: '摆件相框次数不足，请充值' };
  }
  return { ok: true };
}

async function refundStoreFrame(storeId, amount = FRAME_COST) {
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
  FRAME_COST,
  chargeStoreForFrame,
  refundStoreFrame
};
