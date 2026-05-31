const cloud = require('wx-server-sdk');
const {
  PORTRAIT_POINTS_SINGLE,
  INSUFFICIENT_POINTS_MSG,
  portraitPointsForStyleCount
} = require('./points');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function insufficientBalanceError() {
  const err = new Error(INSUFFICIENT_POINTS_MSG);
  err.code = 'INSUFFICIENT_BALANCE';
  throw err;
}

async function countPendingUnchargedTasks(storeId) {
  const res = await db
    .collection('ai_tasks')
    .where({
      storeId,
      engine: 'jimeng',
      charged: false,
      status: _.in(['pending', 'processing'])
    })
    .count();
  return res.total || 0;
}

function assertBalanceAtLeast(balance, required) {
  const need = Math.max(1, Number(required) || 1);
  if (Number(balance) < need) insufficientBalanceError();
}

/** 单条 submit / retry：余额须覆盖未扣费排队 + 本次单张积分 */
async function assertCanSubmitPortrait(storeId) {
  if (!storeId) insufficientBalanceError();

  const storeRes = await db.collection('stores').doc(storeId).get();
  const balance = Number(storeRes.data?.balance) || 0;
  assertBalanceAtLeast(balance, PORTRAIT_POINTS_SINGLE);

  const pending = await countPendingUnchargedTasks(storeId);
  const reserved = pending * PORTRAIT_POINTS_SINGLE;
  if (balance < reserved + PORTRAIT_POINTS_SINGLE) insufficientBalanceError();
}

/** 批次 submitBatch：一次性预检 balance >= 套系积分 */
async function assertCanSubmitPortraitBatch(storeId, styleCount) {
  if (!storeId) insufficientBalanceError();
  const need = portraitPointsForStyleCount(styleCount);
  if (!need) insufficientBalanceError();

  const storeRes = await db.collection('stores').doc(storeId).get();
  const balance = Number(storeRes.data?.balance) || 0;
  assertBalanceAtLeast(balance, need);
}

async function markTasksCharged(taskIds, chargeAmount) {
  const now = new Date();
  for (const taskId of taskIds) {
    await db.collection('ai_tasks').doc(taskId).update({
      data: {
        charged: true,
        chargedAt: now,
        chargeAmount: Number(chargeAmount) || 0,
        updateTime: now
      }
    });
  }
}

/** Worker / 单条 retry：提交即梦前扣单张积分（失败不退） */
async function chargeStoreForPortrait(storeId, taskId) {
  if (!storeId) insufficientBalanceError();

  const updateRes = await db
    .collection('stores')
    .where({
      _id: storeId,
      balance: _.gte(PORTRAIT_POINTS_SINGLE)
    })
    .update({
      data: {
        balance: _.inc(-PORTRAIT_POINTS_SINGLE),
        updateTime: new Date()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    insufficientBalanceError();
  }

  await markTasksCharged([taskId], PORTRAIT_POINTS_SINGLE);
  return PORTRAIT_POINTS_SINGLE;
}

/** 批次 submitBatch：一次性扣套系积分并标记各 task 已扣费 */
async function chargeStoreForPortraitBatch(storeId, taskIds, styleCount) {
  const ids = (taskIds || []).filter(Boolean);
  if (!storeId || !ids.length) insufficientBalanceError();

  const totalPoints = portraitPointsForStyleCount(styleCount || ids.length);

  const updateRes = await db
    .collection('stores')
    .where({
      _id: storeId,
      balance: _.gte(totalPoints)
    })
    .update({
      data: {
        balance: _.inc(-totalPoints),
        updateTime: new Date()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    insufficientBalanceError();
  }

  for (let i = 0; i < ids.length; i += 1) {
    await markTasksCharged([ids[i]], i === 0 ? totalPoints : 0);
  }
  return totalPoints;
}

module.exports = {
  PORTRAIT_POINTS_SINGLE,
  INSUFFICIENT_POINTS_MSG,
  insufficientBalanceError,
  assertCanSubmitPortrait,
  assertCanSubmitPortraitBatch,
  chargeStoreForPortrait,
  chargeStoreForPortraitBatch,
  portraitPointsForStyleCount
};
