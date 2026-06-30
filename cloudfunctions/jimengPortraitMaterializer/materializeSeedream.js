const cloud = require('wx-server-sdk');
const { downloadSeedreamImage } = require('./lib/seedreamDownload');
const { deleteReplacedCloudFile } = require('./lib/cloudFile');
const { toUserFacingError, TIMEOUT_FAIL } = require('./lib/userFacingError');
const {
  PORTRAIT_ENGINE_SEEDREAM,
  normalizePortraitEngine
} = require('./lib/portraitEngineConfig');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const MAX_MATERIALIZE_ATTEMPTS = 4;
const STALE_TASK_MS = 30 * 60 * 1000;

function taskTimestamp(task) {
  const raw = task.updateTime || task.createTime;
  if (!raw) return 0;
  const ts = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function isTaskStale(task) {
  const raw = task.createTime || task.updateTime;
  if (!raw) return false;
  const ts = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  if (!ts || Number.isNaN(ts)) return false;
  return Date.now() - ts > STALE_TASK_MS;
}

function isUrlPermanentFailure(err) {
  const status = err && err.response && err.response.status;
  if (status === 404 || status === 403 || status === 410) return true;
  const msg = String((err && err.message) || '').toLowerCase();
  return /expired|not found|forbidden|access denied|no such key|signature.*expired|invalid url/i.test(
    msg
  );
}

function isTransientMaterializeError(err) {
  if (!err || isUrlPermanentFailure(err)) return false;
  const msg = String(err.message || '');
  if (/timeout|ECONNRESET|ETIMEDOUT|socket hang up|network|502|503|504/i.test(msg)) {
    return true;
  }
  const status = err.response && err.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

async function markTaskFailed(task, errMsg, technicalMsg) {
  const userMsg = toUserFacingError(errMsg);
  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'failed',
      phase: 'failed',
      errorMsg: technicalMsg || String(errMsg || ''),
      userErrorMsg: userMsg,
      materializeBusy: false,
      updateTime: new Date()
    }
  });
  await db
    .collection('photos')
    .doc(task.photoId)
    .update({
      data: { generateStatus: 'failed', errorMsg: userMsg, updateTime: new Date() }
    })
    .catch((e) =>
      console.warn('[jimengPortraitMaterializer] 更新照片失败状态失败', e.message || e)
    );
}

async function completeTask(task, resultBuffer, previousAiUrl) {
  const cloudPath = `ai-generated/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;
  const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: resultBuffer });

  await db.collection('photos').doc(task.photoId).update({
    data: {
      aiUrl: uploadRes.fileID,
      isGenerated: true,
      generateStatus: 'completed',
      errorMsg: null,
      updateTime: new Date()
    }
  });
  await deleteReplacedCloudFile(previousAiUrl, uploadRes.fileID);
  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'completed',
      phase: 'done',
      resultFileID: uploadRes.fileID,
      errorMsg: null,
      lastError: null,
      materializeBusy: false,
      updateTime: new Date()
    }
  });

  console.log('[jimengPortraitMaterializer] 任务完成', task._id);
  return { ok: true, completed: true, taskId: task._id, fileID: uploadRes.fileID };
}

async function claimMaterializeTask(taskId) {
  const res = await db
    .collection('ai_tasks')
    .where({
      _id: taskId,
      status: 'processing',
      phase: 'materializing',
      materializeBusy: _.neq(true)
    })
    .update({
      data: {
        materializeBusy: true,
        updateTime: new Date()
      }
    });
  return !!(res.stats && res.stats.updated);
}

async function releaseMaterializeBusy(taskId) {
  await db
    .collection('ai_tasks')
    .doc(taskId)
    .update({
      data: { materializeBusy: false, updateTime: new Date() }
    })
    .catch(() => {});
}

async function handleMaterializeFailure(task, err) {
  console.error('[jimengPortraitMaterializer] 落库失败', task._id, err.message || err);
  if (err.response) {
    try {
      console.error(
        '[jimengPortraitMaterializer] 响应:',
        err.response.status,
        JSON.stringify(err.response.data).substring(0, 500)
      );
    } catch (e) {
      /* ignore */
    }
  }

  if (isUrlPermanentFailure(err)) {
    await markTaskFailed(task, err.message, `seedream url invalid: ${err.message}`);
    return { ok: false, failed: true, taskId: task._id, permanent: true };
  }

  const attempts = Number(task.materializeAttempts || 0) + 1;
  if (!isTransientMaterializeError(err) || attempts >= MAX_MATERIALIZE_ATTEMPTS) {
    await markTaskFailed(task, err.message, err.message);
    return { ok: false, failed: true, taskId: task._id };
  }

  console.warn(
    `[jimengPortraitMaterializer] 临时失败，保留 materializing ${attempts}/${MAX_MATERIALIZE_ATTEMPTS}`,
    task._id,
    err.message
  );
  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      materializeAttempts: attempts,
      materializeBusy: false,
      lastError: String(err.message || ''),
      updateTime: new Date()
    }
  });
  return { ok: false, retry: true, taskId: task._id, attempts };
}

async function main(taskId) {
  const taskRes = await db.collection('ai_tasks').doc(taskId).get().catch(() => null);
  const task = taskRes && taskRes.data;
  if (!task) {
    return { ok: false, error: '任务不存在', taskId };
  }

  if (normalizePortraitEngine(task.engine) !== PORTRAIT_ENGINE_SEEDREAM) {
    return { ok: false, error: '非智绘任务', taskId };
  }

  if (task.status === 'completed' || task.phase === 'done') {
    return { ok: true, skipped: true, reason: 'already completed', taskId };
  }

  if (isTaskStale(task)) {
    await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    return { ok: false, failed: true, taskId, error: TIMEOUT_FAIL };
  }

  const resultUrl = String(task.seedreamResultUrl || '').trim();
  if (!resultUrl || task.phase !== 'materializing') {
    return { ok: false, error: '任务不在 materializing 或缺少 seedreamResultUrl', taskId };
  }

  const photoRes = await db.collection('photos').doc(task.photoId).get().catch(() => null);
  const photo = photoRes && photoRes.data;
  if (!photo) {
    await markTaskFailed(task, '照片不存在', 'photo missing');
    return { ok: false, failed: true, taskId };
  }

  if (photo.generateStatus === 'completed' && photo.aiUrl) {
    await db.collection('ai_tasks').doc(task._id).update({
      data: {
        status: 'completed',
        phase: 'done',
        resultFileID: photo.aiUrl,
        materializeBusy: false,
        updateTime: new Date()
      }
    });
    return { ok: true, skipped: true, reason: 'photo already completed', taskId };
  }

  const claimed = await claimMaterializeTask(taskId);
  if (!claimed) {
    return { ok: true, skipped: true, reason: 'busy or state changed', taskId };
  }

  try {
    console.log('[jimengPortraitMaterializer] 下载落库', taskId, task.styleId || '');
    const buffer = await downloadSeedreamImage(resultUrl);
    return await completeTask(task, buffer, photo.aiUrl || '');
  } catch (err) {
    await releaseMaterializeBusy(taskId);
    const freshRes = await db.collection('ai_tasks').doc(taskId).get().catch(() => null);
    const freshTask = (freshRes && freshRes.data) || task;
    return handleMaterializeFailure(freshTask, err);
  }
}

module.exports = { main };
