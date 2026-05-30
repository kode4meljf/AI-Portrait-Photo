const cloud = require('wx-server-sdk');
const { resolveStoreIdFromOpenid } = require('./lib/resolveStoreMember');
const {
  assertCanSubmitPortraitBatch,
  chargeStoreForPortraitBatch,
  INSUFFICIENT_BALANCE_MSG
} = require('./lib/balance');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const STYLE_TEMPLATES_COLLECTION = 'style_templates';

async function loadStyle(styleId) {
  const styleRes = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: styleId }).get();
  if (!styleRes.data.length) {
    throw new Error(`风格不存在: ${styleId}`);
  }
  const style = styleRes.data[0];
  const prompt = style.prompt || '';
  if (!prompt) throw new Error(`风格缺少 prompt: ${styleId}`);
  return {
    styleId,
    prompt,
    resolution: style.resolution || '1024:1024'
  };
}

async function rollbackTasks(taskIds) {
  for (const id of taskIds) {
    try {
      await db.collection('ai_tasks').doc(id).remove();
    } catch (err) {
      console.warn('[jimengPortraitAi/submitBatch] rollback task failed', id, err.message || err);
    }
  }
}

/**
 * 批次入队 + 预扣 balance（失败不退，由 Worker 执行即梦）
 * items: [{ photoId, styleId }]
 */
async function main(event) {
  const batchId = String(event.batchId || '').trim();
  const items = Array.isArray(event.items) ? event.items : [];
  if (!items.length) {
    return { success: false, error: '缺少 items' };
  }

  const normalized = items.map((row, index) => ({
    photoId: String(row.photoId || row.id || '').trim(),
    styleId: String(row.styleId || '').trim(),
    batchIndex: Number(row.batchIndex != null ? row.batchIndex : index)
  }));

  for (const row of normalized) {
    if (!row.photoId || !row.styleId) {
      return { success: false, error: 'items 中缺少 photoId 或 styleId' };
    }
  }

  const createdTaskIds = [];

  try {
    const storeId = await resolveStoreIdFromOpenid(cloud.getWXContext().OPENID);
    await assertCanSubmitPortraitBatch(storeId, normalized.length);

    const styleMap = {};
    for (const row of normalized) {
      if (!styleMap[row.styleId]) {
        styleMap[row.styleId] = await loadStyle(row.styleId);
      }
    }

    const now = new Date();

    for (const row of normalized) {
      const style = styleMap[row.styleId];
      const addRes = await db.collection('ai_tasks').add({
        data: {
          photoId: row.photoId,
          styleId: row.styleId,
          storeId,
          batchId: batchId || null,
          batchIndex: row.batchIndex,
          status: 'pending',
          engine: 'jimeng',
          prompt: style.prompt,
          resolution: style.resolution,
          jimengTaskId: null,
          charged: false,
          chargeAmount: 0,
          createTime: now,
          updateTime: now,
          resultFileID: null,
          errorMsg: null
        }
      });
      createdTaskIds.push(addRes._id);

      try {
        await db.collection('photos').doc(row.photoId).update({
          data: {
            generateStatus: 'pending',
            isGenerated: false,
            errorMsg: null,
            updateTime: now
          }
        });
      } catch (photoErr) {
        await rollbackTasks(createdTaskIds);
        throw photoErr;
      }
    }

    await chargeStoreForPortraitBatch(storeId, createdTaskIds);

    return {
      success: true,
      batchId: batchId || null,
      taskIds: createdTaskIds,
      count: createdTaskIds.length,
      message: '批次任务已入队'
    };
  } catch (err) {
    if (createdTaskIds.length) {
      await rollbackTasks(createdTaskIds);
    }
    console.error('[jimengPortraitAi/submitBatch] 失败:', err);
    const message =
      err.code === 'INSUFFICIENT_BALANCE' ? INSUFFICIENT_BALANCE_MSG : err.message || '批次提交失败';
    return { success: false, error: message, code: err.code || '' };
  }
}

module.exports = { main };
