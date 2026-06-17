const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PLATFORM_SETTINGS_COL = 'platform_settings';
const PLATFORM_SETTINGS_ID = 'default';
const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_JIMENG_MAX_CONCURRENCY = 1;
const JIMENG_MAX_ALLOWED = 10;

const DEFAULT_SEEDREAM_MAX_CONCURRENCY = 10;
const SEEDREAM_MAX_ALLOWED = 50;

/** @type {{ value: { jimeng: number, seedream: number }, loadedAt: number } | null} */
let cache = null;

function clampJimengMaxConcurrency(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_JIMENG_MAX_CONCURRENCY;
  return Math.min(JIMENG_MAX_ALLOWED, Math.max(1, Math.floor(n)));
}

function clampSeedreamMaxConcurrency(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SEEDREAM_MAX_CONCURRENCY;
  return Math.min(SEEDREAM_MAX_ALLOWED, Math.max(1, Math.floor(n)));
}

function readJimengMaxConcurrencyFromEnv() {
  const raw = process.env.JIMENG_MAX_CONCURRENCY;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return clampJimengMaxConcurrency(raw);
}

function readSeedreamMaxConcurrencyFromEnv() {
  const raw = process.env.SEEDREAM_MAX_CONCURRENCY;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return clampSeedreamMaxConcurrency(raw);
}

function isCacheFresh(entry) {
  if (!entry || entry.value == null) return false;
  return Date.now() - entry.loadedAt < CACHE_TTL_MS;
}

async function readConcurrencyFromDatabase() {
  const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get();
  const data = res.data || {};
  const jimeng =
    data.jimengMaxConcurrency == null || data.jimengMaxConcurrency === ''
      ? DEFAULT_JIMENG_MAX_CONCURRENCY
      : clampJimengMaxConcurrency(data.jimengMaxConcurrency);
  const seedream =
    data.seedreamMaxConcurrency == null || data.seedreamMaxConcurrency === ''
      ? DEFAULT_SEEDREAM_MAX_CONCURRENCY
      : clampSeedreamMaxConcurrency(data.seedreamMaxConcurrency);
  return { jimeng, seedream };
}

function invalidateJimengConfigCache() {
  cache = null;
}

async function getPortraitConcurrencyLimits(options = {}) {
  const forceRefresh = !!options.forceRefresh;
  const jimengEnv = readJimengMaxConcurrencyFromEnv();
  const seedreamEnv = readSeedreamMaxConcurrencyFromEnv();

  if (!forceRefresh && isCacheFresh(cache)) {
    return {
      jimeng: jimengEnv != null ? jimengEnv : cache.value.jimeng,
      seedream: seedreamEnv != null ? seedreamEnv : cache.value.seedream
    };
  }

  const fromDb = await readConcurrencyFromDatabase();
  cache = { value: fromDb, loadedAt: Date.now() };
  return {
    jimeng: jimengEnv != null ? jimengEnv : fromDb.jimeng,
    seedream: seedreamEnv != null ? seedreamEnv : fromDb.seedream
  };
}

/** 即梦并行 submit / poll 上限：环境变量 > 管理后台 > 默认 1 */
async function getJimengMaxConcurrency(options = {}) {
  const limits = await getPortraitConcurrencyLimits(options);
  return limits.jimeng;
}

/** Seedream 同步图生图并行上限：环境变量 > 管理后台 > 默认 10 */
async function getSeedreamMaxConcurrency(options = {}) {
  const limits = await getPortraitConcurrencyLimits(options);
  return limits.seedream;
}

module.exports = {
  DEFAULT_MAX_CONCURRENCY: DEFAULT_JIMENG_MAX_CONCURRENCY,
  DEFAULT_JIMENG_MAX_CONCURRENCY,
  DEFAULT_SEEDREAM_MAX_CONCURRENCY,
  MAX_ALLOWED: JIMENG_MAX_ALLOWED,
  JIMENG_MAX_ALLOWED,
  SEEDREAM_MAX_ALLOWED,
  clampMaxConcurrency: clampJimengMaxConcurrency,
  clampJimengMaxConcurrency,
  clampSeedreamMaxConcurrency,
  getPortraitConcurrencyLimits,
  getJimengMaxConcurrency,
  getSeedreamMaxConcurrency,
  invalidateJimengConfigCache
};
