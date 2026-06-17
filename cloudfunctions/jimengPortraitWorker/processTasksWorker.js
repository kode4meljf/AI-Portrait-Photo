const cloud = require('wx-server-sdk');
const { submitJimengTask, pollJimengTask } = require('./lib/jimeng');
const { generateSeedreamPortrait } = require('./lib/arkSeedream');
const { deleteReplacedCloudFile } = require('./lib/cloudFile');
const { chargeStoreForPortrait } = require('./lib/balance');
const { toUserFacingError, TIMEOUT_FAIL } = require('./lib/userFacingError');
const { isJimengRateLimitError } = require('./lib/jimengRateLimit');
const { getPortraitConcurrencyLimits } = require('./lib/platformJimengConfig');
const { getSeedreamConfig } = require('./lib/platformPortraitConfig');
const {
  PORTRAIT_ENGINE_JIMENG,
  PORTRAIT_ENGINE_SEEDREAM,
  normalizePortraitEngine
} = require('./lib/portraitEngineConfig');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const STYLE_TEMPLATES_COLLECTION = 'style_templates';
const STALE_TASK_MS = 30 * 60 * 1000;
const MAX_SUBMIT_ATTEMPTS = 4;
const MAX_POLL_ATTEMPTS = 20;
const STUCK_PROCESSING_GRACE_MS = 8000;
/** 微信云函数平台上限 60s（见 config.json），不可调高 */
const CLOUD_FUNCTION_TIMEOUT_MS = 60000;
const CLOUD_FUNCTION_TAIL_MS = 5000;
/** Seedream 同步生图若被平台强杀，略大于 60s 后允许重新认领 */
const STUCK_SEEDREAM_GENERATING_MS = CLOUD_FUNCTION_TIMEOUT_MS + 10 * 1000;

/** 单轮 Worker 执行预算，留 tail 给平台收尾 */
const WORKER_BUDGET_MS = CLOUD_FUNCTION_TIMEOUT_MS - CLOUD_FUNCTION_TAIL_MS;
const POLL_BUDGET_MS = 10000;
/** 多任务并行时单次 poll 切片，避免占满整轮 budget */
const POLL_SLICE_MS = 6000;

async function getImageUrl(photoFileID) {
  if (photoFileID && String(photoFileID).startsWith('cloud')) {
    const res = await cloud.getTempFileURL({ fileList: [photoFileID] });
    const item = res.fileList && res.fileList[0];
    if (!item || item.status !== 0 || !item.tempFileURL) {
      const detail = (item && item.errMsg) || 'unknown';
      throw new Error(`原图临时链接获取失败: ${detail}`);
    }
    return item.tempFileURL;
  }
  return photoFileID;
}

function parseResolution(resolution) {
  let width = 1024;
  let height = 1024;
  if (resolution) {
    const parts = String(resolution).split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      width = parts[0];
      height = parts[1];
    }
  }
  return { width, height };
}

async function resolvePrompt(task) {
  if (task.prompt) return task.prompt;
  const styleId = task.styleId;
  if (!styleId) throw new Error('任务缺少 styleId');
  const styleRes = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: styleId }).get();
  if (!styleRes.data.length) throw new Error(`风格不存在，styleId: ${styleId}`);
  const prompt = styleRes.data[0].prompt;
  if (!prompt) throw new Error('风格缺少 prompt');
  return prompt;
}

async function markTaskFailed(task, errMsg, technicalMsg) {
  const userMsg = toUserFacingError(errMsg);
  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'failed',
      phase: 'failed',
      errorMsg: technicalMsg || String(errMsg || ''),
      userErrorMsg: userMsg,
      updateTime: new Date()
    }
  });
  await db
    .collection('photos')
    .doc(task.photoId)
    .update({
      data: { generateStatus: 'failed', errorMsg: userMsg, updateTime: new Date() }
    })
    .catch((e) => console.warn('[jimengPortraitWorker] 更新照片失败状态失败', e.message || e));
}

function taskTimestamp(task) {
  const raw = task.updateTime || task.createTime;
  if (!raw) return 0;
  const ts = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isNaN(ts) ? 0 : ts;
}

function isStuckSeedreamGenerating(task) {
  if (normalizePortraitEngine(task.engine) !== PORTRAIT_ENGINE_SEEDREAM) return false;
  if (task.phase !== 'generating') return false;
  return Date.now() - taskTimestamp(task) >= STUCK_SEEDREAM_GENERATING_MS;
}

function buildTaskScopeWhere(base, priorityBatchId) {
  const batchId = String(priorityBatchId || '').trim();
  if (!batchId) return base;
  return { ...base, batchId };
}

function pickByBatchFirst(list, priorityBatchId) {
  if (!list.length) return null;
  const batchId = String(priorityBatchId || '').trim();
  if (!batchId) return list[0];
  return list.find((t) => String(t.batchId || '') === batchId) || null;
}

/** 清理超时任务，避免旧队列阻塞当前 batch */
async function purgeStaleTasks(tasks) {
  const active = [];
  for (const task of tasks) {
    if (!isTaskStale(task)) {
      active.push(task);
      continue;
    }
    console.warn('[jimengPortraitWorker] 清理 stale 任务', task._id, task.batchId || '');
    try {
      await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    } catch (e) {
      console.warn('[jimengPortraitWorker] stale 清理失败', task._id, e.message || e);
    }
  }
  return active;
}

function isTransientError(err) {
  if (!err) return false;
  if (isJimengRateLimitError(err)) return true;
  const msg = String(err.message || '');
  if (/timeout|ECONNRESET|ETIMEDOUT|socket hang up|network|502|503|504/i.test(msg)) {
    return true;
  }
  const status = err.response && err.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

async function getFreshTask(task) {
  const freshRes = await db.collection('ai_tasks').doc(task._id).get().catch(() => null);
  return (freshRes && freshRes.data) || task;
}

function logHttpError(prefix, err) {
  console.error(prefix, err.message);
  if (err.response) {
    try {
      console.error(
        '[jimengPortraitWorker] 响应:',
        JSON.stringify(err.response.data).substring(0, 1000)
      );
    } catch (e) {
      /* ignore */
    }
  }
}

async function claimTaskForSubmit(task) {
  const jimengTaskId = (task.jimengTaskId || '').trim();
  if (jimengTaskId) return false;
  if (task.phase === 'generating') {
    if (!isStuckSeedreamGenerating(task)) return false;
    console.warn('[jimengPortraitWorker] 重新认领卡住的 Seedream 任务', task._id);
  }

  if (task.status === 'pending') {
    const res = await db
      .collection('ai_tasks')
      .where({ _id: task._id, status: 'pending' })
      .update({
        data: { status: 'processing', phase: 'submit', updateTime: new Date() }
      });
    return !!(res.stats && res.stats.updated);
  }

  if (task.status === 'processing') {
    const age = Date.now() - taskTimestamp(task);
    return age >= STUCK_PROCESSING_GRACE_MS;
  }

  return false;
}

/** submit 阶段临时失败：可清 jimengTaskId 回 pending 重试 */
async function handleSubmitFailure(task, err) {
  logHttpError('[jimengPortraitWorker] submit 失败', err);

  const freshTask = await getFreshTask(task);
  if (!isTransientError(err)) {
    await markTaskFailed(freshTask, err.message, err.message);
    return { processed: 0, error: toUserFacingError(err) };
  }

  const attempts = Number(freshTask.submitAttempts || 0) + 1;
  if (attempts >= MAX_SUBMIT_ATTEMPTS) {
    await markTaskFailed(freshTask, err.message, err.message);
    return { processed: 0, error: toUserFacingError(err) };
  }

  console.warn(
    `[jimengPortraitWorker] submit 临时失败，回队 ${attempts}/${MAX_SUBMIT_ATTEMPTS}`,
    task._id,
    err.message
  );

  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'pending',
      phase: 'submit',
      jimengTaskId: null,
      submitAttempts: attempts,
      lastError: String(err.message || ''),
      updateTime: new Date()
    }
  });
  await db
    .collection('photos')
    .doc(task.photoId)
    .update({
      data: { generateStatus: 'pending', errorMsg: null, updateTime: new Date() }
    })
    .catch(() => {});

  return { processed: 0, submitRetry: true, taskId: task._id };
}

/** poll 阶段临时失败：保留 jimengTaskId，下轮定时器续查 */
async function handlePollFailure(task, err) {
  logHttpError('[jimengPortraitWorker] poll 失败', err);

  const freshTask = await getFreshTask(task);
  const jimengTaskId = (freshTask.jimengTaskId || '').trim();
  if (!jimengTaskId) {
    return handleSubmitFailure(freshTask, err);
  }

  if (!isTransientError(err)) {
    await markTaskFailed(freshTask, err.message, err.message);
    return { processed: 0, error: toUserFacingError(err) };
  }

  const pollAttempts = Number(freshTask.pollAttempts || 0) + 1;
  if (pollAttempts >= MAX_POLL_ATTEMPTS) {
    await markTaskFailed(
      freshTask,
      err.message,
      `poll attempts exhausted: ${err.message}`
    );
    return { processed: 0, error: toUserFacingError(err) };
  }

  console.warn(
    `[jimengPortraitWorker] poll 限流/临时失败，下轮续查 ${pollAttempts}/${MAX_POLL_ATTEMPTS}`,
    task._id,
    err.message
  );

  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      status: 'processing',
      phase: 'poll',
      pollAttempts,
      lastError: String(err.message || ''),
      lastPollAt: new Date(),
      updateTime: new Date()
    }
  });

  return { processed: 0, pollRetry: true, taskId: task._id };
}

function isTaskStale(task) {
  const raw = task.createTime || task.updateTime;
  if (!raw) return false;
  const ts = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  if (!ts || Number.isNaN(ts)) return false;
  return Date.now() - ts > STALE_TASK_MS;
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
      updateTime: new Date()
    }
  });

  console.log('[jimengPortraitWorker] 任务完成', task._id);
  return { processed: 1, completed: true, taskId: task._id };
}

function sortTasksForPick(list, priorityBatchId) {
  const batchId = String(priorityBatchId || '').trim();
  if (!batchId) return list;
  return list.slice().sort((a, b) => {
    const aHit = String(a.batchId || '') === batchId ? 0 : 1;
    const bHit = String(b.batchId || '') === batchId ? 0 : 1;
    if (aHit !== bHit) return aHit - bHit;
    return taskTimestamp(a) - taskTimestamp(b);
  });
}

async function loadPendingTasks(priorityBatchId, engine) {
  const pendingRes = await db
    .collection('ai_tasks')
    .where(
      buildTaskScopeWhere(
        {
          status: 'pending',
          engine
        },
        priorityBatchId
      )
    )
    .orderBy('createTime', 'asc')
    .limit(40)
    .get();
  return purgeStaleTasks(pendingRes.data || []);
}

async function loadStuckSubmitTasks(priorityBatchId, engine) {
  const procRes = await db
    .collection('ai_tasks')
    .where(
      buildTaskScopeWhere(
        {
          status: 'processing',
          engine
        },
        priorityBatchId
      )
    )
    .orderBy('updateTime', 'asc')
    .limit(20)
    .get();
  let stuck = (procRes.data || []).filter((t) => {
    if ((t.jimengTaskId || '').trim()) return false;
    if (engine === PORTRAIT_ENGINE_SEEDREAM) {
      return t.phase === 'generating' && isStuckSeedreamGenerating(t);
    }
    return t.phase !== 'generating';
  });
  return purgeStaleTasks(stuck);
}

async function pickTasksForEngine(priorityBatchId, engine, limit) {
  const maxPick = Math.max(1, Math.floor(Number(limit) || 1));
  const pending = sortTasksForPick(await loadPendingTasks(priorityBatchId, engine), priorityBatchId);
  const stuck = sortTasksForPick(
    await loadStuckSubmitTasks(priorityBatchId, engine),
    priorityBatchId
  );
  const merged = [];
  const seen = new Set();
  for (const task of [...pending, ...stuck]) {
    if (!task || !task._id || seen.has(task._id)) continue;
    seen.add(task._id);
    merged.push(task);
    if (merged.length >= maxPick) break;
  }
  return merged;
}

async function pickJimengTaskForSubmit(priorityBatchId) {
  const list = await pickTasksForEngine(priorityBatchId, PORTRAIT_ENGINE_JIMENG, 1);
  return list[0] || null;
}

async function pickSeedreamTasksForSubmit(priorityBatchId, limit) {
  return pickTasksForEngine(priorityBatchId, PORTRAIT_ENGINE_SEEDREAM, limit);
}

async function pickTaskForPoll(priorityBatchId) {
  const res = await db
    .collection('ai_tasks')
    .where({ status: 'processing', engine: 'jimeng' })
    .orderBy('updateTime', 'asc')
    .limit(15)
    .get();
  let list = (res.data || []).filter((t) => (t.jimengTaskId || '').trim());
  list = await purgeStaleTasks(list);
  list.sort((a, b) => taskTimestamp({ updateTime: a.lastPollAt || a.updateTime || a.createTime }) -
    taskTimestamp({ updateTime: b.lastPollAt || b.updateTime || b.createTime }));
  return pickByBatchFirst(list, priorityBatchId);
}

/** 各引擎在途任务数（与火山配额 / 方舟 IPM 对齐，分开计数） */
async function countInFlightByEngine() {
  const res = await db
    .collection('ai_tasks')
    .where({
      status: 'processing',
      engine: _.in([PORTRAIT_ENGINE_JIMENG, PORTRAIT_ENGINE_SEEDREAM])
    })
    .limit(100)
    .get();
  let jimeng = 0;
  let seedream = 0;
  for (const t of res.data || []) {
    const engine = normalizePortraitEngine(t.engine);
    if (engine === PORTRAIT_ENGINE_SEEDREAM) {
      if (isStuckSeedreamGenerating(t)) continue;
      seedream += 1;
      continue;
    }
    if ((t.jimengTaskId || '').trim() || t.phase === 'submit') {
      jimeng += 1;
    }
  }
  return { jimeng, seedream, total: jimeng + seedream };
}

async function runSeedreamSubmitPhase(task, photo) {
  const prompt = await resolvePrompt(task);
  const imageUrl = await getImageUrl(photo.originalUrl);
  const seedreamConfig = await getSeedreamConfig();

  await db.collection('ai_tasks').doc(task._id).update({
    data: {
      phase: 'generating',
      updateTime: new Date()
    }
  });

  const sizeLabel = seedreamConfig.outputSize || 'auto';
  console.log('[jimengPortraitWorker] 提交 Seedream', task._id, task.styleId || '', sizeLabel);
  const resultBuffer = await generateSeedreamPortrait(imageUrl, prompt, seedreamConfig);
  return completeTask(task, resultBuffer, photo.aiUrl || '');
}

/** 阶段 A：扣费 → submit 即梦 → 写 jimengTaskId（同次调用不 poll） */
async function runSubmitPhase(task) {
  if (isTaskStale(task)) {
    console.warn('[jimengPortraitWorker] 任务超时', task._id);
    await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    return { processed: 0, error: TIMEOUT_FAIL };
  }

  const claimed = await claimTaskForSubmit(task);
  if (!claimed) {
    return { processed: 0, skipped: true };
  }

  try {
    const freshRes = await db.collection('ai_tasks').doc(task._id).get();
    if (!freshRes.data) throw new Error('任务不存在');
    task = freshRes.data;

    const photoRes = await db.collection('photos').doc(task.photoId).get();
    if (!photoRes.data) throw new Error('照片不存在');
    const photo = photoRes.data;

    await db
      .collection('photos')
      .doc(task.photoId)
      .update({ data: { generateStatus: 'processing', errorMsg: null, updateTime: new Date() } })
      .catch(() => {});

    if (!task.charged) {
      const storeId = task.storeId || photo.storeId;
      await chargeStoreForPortrait(storeId, task._id);
      task.charged = true;
    }

    const prompt = await resolvePrompt(task);
    const { width, height } = parseResolution(task.resolution);
    const imageUrl = await getImageUrl(photo.originalUrl);

    if (normalizePortraitEngine(task.engine) === PORTRAIT_ENGINE_SEEDREAM) {
      return runSeedreamSubmitPhase(task, photo);
    }

    console.log('[jimengPortraitWorker] 提交即梦', task._id, task.styleId || '');
    const jimengTaskId = await submitJimengTask(imageUrl, prompt, { width, height });

    await db.collection('ai_tasks').doc(task._id).update({
      data: {
        jimengTaskId,
        status: 'processing',
        phase: 'poll',
        submitAttempts: 0,
        pollAttempts: 0,
        lastError: null,
        errorMsg: null,
        updateTime: new Date()
      }
    });
    await db.collection('photos').doc(task.photoId).update({
      data: { generateStatus: 'processing', updateTime: new Date() }
    });

    return { processed: 1, submitted: true, taskId: task._id };
  } catch (err) {
    return handleSubmitFailure(task, err);
  }
}

/** 阶段 B：短预算 poll，未完成则下轮定时器续查 */
async function runPollPhase(task, budgetMs) {
  if (normalizePortraitEngine(task.engine) === PORTRAIT_ENGINE_SEEDREAM) {
    return { processed: 0, skipped: true };
  }

  if (isTaskStale(task)) {
    console.warn('[jimengPortraitWorker] 任务超时', task._id);
    await markTaskFailed(task, TIMEOUT_FAIL, 'task stale timeout');
    return { processed: 0, error: TIMEOUT_FAIL };
  }

  const jimengTaskId = (task.jimengTaskId || '').trim();
  if (!jimengTaskId) {
    return runSubmitPhase(task);
  }

  try {
    const photoRes = await db.collection('photos').doc(task.photoId).get();
    if (!photoRes.data) throw new Error('照片不存在');
    const previousAiUrl = photoRes.data.aiUrl || '';

    const pollResult = await pollJimengTask(jimengTaskId, {
      budgetMs: Math.max(3000, budgetMs),
      skipInitialDelay: true
    });

    if (pollResult.status === 'done') {
      return completeTask(task, pollResult.buffer, previousAiUrl);
    }

    await db.collection('ai_tasks').doc(task._id).update({
      data: {
        status: 'processing',
        phase: 'poll',
        jimengTaskId,
        lastPollAt: new Date(),
        updateTime: new Date()
      }
    });
    console.log('[jimengPortraitWorker] 即梦未完成，下轮续查', task._id);
    return { processed: 0, continuing: true, taskId: task._id };
  } catch (err) {
    return handlePollFailure(task, err);
  }
}

async function logWorkerIdleReason(priorityBatchId, inFlight, limits) {
  const batchId = String(priorityBatchId || '').trim();
  const pendingWhere = buildTaskScopeWhere(
    { status: 'pending', engine: _.in([PORTRAIT_ENGINE_JIMENG, PORTRAIT_ENGINE_SEEDREAM]) },
    priorityBatchId
  );
  const processingWhere = buildTaskScopeWhere(
    { status: 'processing', engine: _.in([PORTRAIT_ENGINE_JIMENG, PORTRAIT_ENGINE_SEEDREAM]) },
    priorityBatchId
  );
  const [pendingRes, processingRes] = await Promise.all([
    db.collection('ai_tasks').where(pendingWhere).count(),
    db.collection('ai_tasks').where(processingWhere).count()
  ]);
  console.log(
    '[jimengPortraitWorker] 本轮无进展',
    JSON.stringify({
      priorityBatchId: batchId || null,
      inFlightJimeng: inFlight.jimeng,
      inFlightSeedream: inFlight.seedream,
      maxJimeng: limits.jimeng,
      maxSeedream: limits.seedream,
      pendingCount: pendingRes.total || 0,
      processingCount: processingRes.total || 0
    })
  );
}

function summarizeBatchResults(results) {
  let submitted = 0;
  let completed = 0;
  let lastResult = { processed: 0 };
  for (const result of results) {
    lastResult = result;
    if (result.submitted) submitted += 1;
    if (result.completed) completed += 1;
  }
  return { submitted, completed, lastResult };
}

/**
 * Seedream：有空闲槽位时并行 submit；即梦：submit / poll 串行，分开 inFlight 上限。
 */
async function workerLoop(event, deadline) {
  const priorityBatchId = String(event.priorityBatchId || '').trim();
  const limits = await getPortraitConcurrencyLimits();
  let lastResult = { processed: 0, limits };
  let submittedCount = 0;
  let completedCount = 0;

  while (Date.now() < deadline - 1500) {
    const remaining = deadline - Date.now();
    if (remaining < 2000) break;

    const inFlight = await countInFlightByEngine();
    let didWork = false;

    const seedreamSlots = Math.max(0, limits.seedream - inFlight.seedream);
    if (seedreamSlots > 0) {
      const seedreamTasks = await pickSeedreamTasksForSubmit(priorityBatchId, seedreamSlots);
      if (seedreamTasks.length) {
        const results = await Promise.all(seedreamTasks.map((task) => runSubmitPhase(task)));
        const batch = summarizeBatchResults(results);
        submittedCount += batch.submitted;
        completedCount += batch.completed;
        lastResult = {
          ...batch.lastResult,
          limits,
          inFlightBefore: inFlight,
          seedreamParallel: seedreamTasks.length
        };
        didWork = true;
        continue;
      }
    }

    if (inFlight.jimeng < limits.jimeng) {
      const jimengTask = await pickJimengTaskForSubmit(priorityBatchId);
      if (jimengTask) {
        const result = await runSubmitPhase(jimengTask);
        lastResult = { ...result, limits, inFlightBefore: inFlight };
        didWork = true;
        if (result.submitted) {
          submittedCount += 1;
          continue;
        }
        if (result.completed) completedCount += 1;
        if (result.error || result.skipped) {
          /* 继续尝试 poll 或其它 pending */
        } else {
          continue;
        }
      }
    }

    const pollTask = await pickTaskForPoll(priorityBatchId);
    if (pollTask) {
      const budget = Math.min(POLL_SLICE_MS, POLL_BUDGET_MS, remaining - 1500);
      if (budget >= 3000) {
        const result = await runPollPhase(pollTask, budget);
        lastResult = { ...result, limits, inFlightBefore: inFlight };
        didWork = true;
        if (result.completed) {
          completedCount += 1;
          continue;
        }
        if (result.continuing || result.pollRetry) {
          continue;
        }
      }
    }

    if (!didWork) break;
  }

  const processed = submittedCount + completedCount;
  if (processed === 0 && submittedCount === 0 && completedCount === 0) {
    await logWorkerIdleReason(priorityBatchId, await countInFlightByEngine(), limits);
  }
  return {
    ...lastResult,
    processed: processed > 0 ? processed : lastResult.processed || 0,
    submittedCount,
    completedCount,
    limits
  };
}

async function main(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  const source =
    event.Type === 'Timer' || event.TriggerName
      ? 'timer'
      : event.action === 'run'
        ? 'kick'
        : 'manual';
  console.log('[jimengPortraitWorker] 触发来源', source, event.priorityBatchId || '');

  const deadline = Date.now() + WORKER_BUDGET_MS;
  const result = await workerLoop(event, deadline);
  const summary = { ...result, source, budgetMs: WORKER_BUDGET_MS };
  console.log('[jimengPortraitWorker] 结束', JSON.stringify(summary));
  return summary;
}

module.exports = { main };
