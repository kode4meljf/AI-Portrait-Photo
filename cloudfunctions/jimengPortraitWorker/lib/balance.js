const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PORTRAIT_COST = 1;
const INSUFFICIENT_BALANCE_MSG = '剩余次数不足，请先充值';

function insufficientBalanceError() {
  const err = new Error(INSUFFICIENT_BALANCE_MSG);
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

/** 单条 submit / retry：余额须覆盖未扣费排队 + 本次 1 次 */
async function assertCanSubmitPortrait(storeId) {
  if (!storeId) insufficientBalanceError();

  const storeRes = await db.collection('stores').doc(storeId).get();
  const balance = Number(storeRes.data?.balance) || 0;
  assertBalanceAtLeast(balance, 1);

  const pending = await countPendingUnchargedTasks(storeId);
  if (balance <= pending) insufficientBalanceError();
}

/** 批次 submitBatch：一次性预检 balance >= N */
async function assertCanSubmitPortraitBatch(storeId, count) {
  if (!storeId) insufficientBalanceError();
  const need = Math.max(1, Number(count) || 0);
  if (!need) insufficientBalanceError();

  const storeRes = await db.collection('stores').doc(storeId).get();
  const balance = Number(storeRes.data?.balance) || 0;
  assertBalanceAtLeast(balance, need);
}

async function markTasksCharged(taskIds, chargeAmount = PORTRAIT_COST) {
  const now = new Date();
  for (const taskId of taskIds) {
    await db.collection('ai_tasks').doc(taskId).update({
      data: {
        charged: true,
        chargedAt: now,
        chargeAmount,
        updateTime: now
      }
    });
  }
}

/** Worker / 单条 retry：提交即梦前扣 1 次（失败不退） */
async function chargeStoreForPortrait(storeId, taskId) {
  if (!storeId) insufficientBalanceError();

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
    insufficientBalanceError();
  }

  await markTasksCharged([taskId], PORTRAIT_COST);
  return PORTRAIT_COST;
}

/** 批次 submitBatch：一次性扣 N 次并标记各 task 已扣费 */
async function chargeStoreForPortraitBatch(storeId, taskIds) {
  const ids = (taskIds || []).filter(Boolean);
  const count = ids.length;
  if (!storeId || !count) insufficientBalanceError();

  const updateRes = await db
    .collection('stores')
    .where({
      _id: storeId,
      balance: _.gte(count)
    })
    .update({
      data: {
        balance: _.inc(-count),
        updateTime: new Date()
      }
    });

  if (!updateRes.stats || updateRes.stats.updated === 0) {
    insufficientBalanceError();
  }

  await markTasksCharged(ids, PORTRAIT_COST);
  return count * PORTRAIT_COST;
}

module.exports = {
  PORTRAIT_COST,
  INSUFFICIENT_BALANCE_MSG,
  insufficientBalanceError,
  assertCanSubmitPortrait,
  assertCanSubmitPortraitBatch,
  chargeStoreForPortrait,
  chargeStoreForPortraitBatch
};
