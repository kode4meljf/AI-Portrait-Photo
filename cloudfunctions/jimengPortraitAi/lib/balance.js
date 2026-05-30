const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PORTRAIT_COST = 1;

async function chargeStoreForPortrait(storeId, taskId) {
  if (!storeId) {
    const err = new Error('INSUFFICIENT_BALANCE');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  const updateRes = await db
    .collection('stores')
    .where({
      _id: storeId,
      balance: _.gte(PORTRAIT_COST)
    })
    .update({
      data: {
        balance: _.inc(-PORTRAIT_COST),
        updateTime: new Date()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    const err = new Error('INSUFFICIENT_BALANCE');
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  await db.collection('ai_tasks').doc(taskId).update({
    data: {
      charged: true,
      chargedAt: new Date(),
      chargeAmount: PORTRAIT_COST,
      updateTime: new Date()
    }
  });

  return PORTRAIT_COST;
}

module.exports = {
  PORTRAIT_COST,
  chargeStoreForPortrait
};
