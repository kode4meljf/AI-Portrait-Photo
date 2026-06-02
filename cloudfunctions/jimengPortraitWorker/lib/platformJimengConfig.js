const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PLATFORM_SETTINGS_COL = 'platform_settings';
const PLATFORM_SETTINGS_ID = 'default';
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CONCURRENCY = 1;
const MAX_ALLOWED = 10;

let cache = null;

function clampMaxConcurrency(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_MAX_CONCURRENCY;
  return Math.min(MAX_ALLOWED, Math.max(1, Math.floor(n)));
}

function readMaxConcurrencyFromEnv() {
  const raw = process.env.JIMENG_MAX_CONCURRENCY;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  return clampMaxConcurrency(raw);
}

function isCacheFresh(entry) {
  if (!entry || entry.value == null) return false;
  return Date.now() - entry.loadedAt < CACHE_TTL_MS;
}

async function readMaxConcurrencyFromDatabase() {
  const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get();
  const data = res.data || {};
  if (data.jimengMaxConcurrency == null || data.jimengMaxConcurrency === '') {
    return DEFAULT_MAX_CONCURRENCY;
  }
  return clampMaxConcurrency(data.jimengMaxConcurrency);
}

function invalidateJimengConfigCache() {
  cache = null;
}

/**
 * 即梦并行 submit 上限：环境变量 > 管理后台 platform_settings > 默认 1
 */
async function getJimengMaxConcurrency(options = {}) {
  const forceRefresh = !!options.forceRefresh;
  const envVal = readMaxConcurrencyFromEnv();
  if (envVal != null) return envVal;

  if (!forceRefresh && isCacheFresh(cache)) {
    return cache.value;
  }

  const value = await readMaxConcurrencyFromDatabase();
  cache = { value, loadedAt: Date.now() };
  return value;
}

module.exports = {
  DEFAULT_MAX_CONCURRENCY,
  MAX_ALLOWED,
  clampMaxConcurrency,
  getJimengMaxConcurrency,
  invalidateJimengConfigCache
};
