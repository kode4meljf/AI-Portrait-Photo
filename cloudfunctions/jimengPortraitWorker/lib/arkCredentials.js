const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PLATFORM_SETTINGS_COL = 'platform_settings';
const PLATFORM_SETTINGS_ID = 'default';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = null;

function readFromEnv() {
  const apiKey = String(process.env.ARK_API_KEY || '').trim();
  if (apiKey) {
    return { apiKey, source: 'env' };
  }
  return null;
}

function isCacheFresh(entry) {
  if (!entry || !entry.apiKey) return false;
  return Date.now() - entry.loadedAt < CACHE_TTL_MS;
}

async function readFromDatabase() {
  const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get();
  const data = res.data || {};
  const apiKey = String(data.arkApiKey || '').trim();
  if (!apiKey) return null;
  return {
    apiKey,
    source: 'db',
    version: data.arkKeysUpdateTime || data.updateTime || null
  };
}

function rememberInCache(creds) {
  cache = {
    apiKey: creds.apiKey,
    loadedAt: Date.now(),
    version: creds.version || null
  };
}

function invalidateArkCredentialsCache() {
  cache = null;
}

async function getArkCredentials(options = {}) {
  const forceRefresh = !!options.forceRefresh;
  const envCreds = readFromEnv();
  if (envCreds) return envCreds;

  if (!forceRefresh && isCacheFresh(cache)) {
    return { apiKey: cache.apiKey, source: 'cache' };
  }

  const dbCreds = await readFromDatabase();
  if (!dbCreds) {
    throw new Error(
      '缺少方舟 API Key：请在管理后台「平台配置」填写智绘引擎密钥，或配置环境变量 ARK_API_KEY'
    );
  }

  rememberInCache(dbCreds);
  return { apiKey: dbCreds.apiKey, source: dbCreds.source };
}

function isArkAuthError(err) {
  if (!err) return false;
  const status = err.response && err.response.status;
  if (status === 401 || status === 403) return true;

  const body = err.response && err.response.data;
  const text = [
    err.message,
    body && body.message,
    body && body.error && body.error.message
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return /unauthorized|invalid.?api.?key|authentication|forbidden/i.test(text);
}

async function withArkCredentials(fn) {
  try {
    const creds = await getArkCredentials();
    return await fn(creds);
  } catch (err) {
    if (!isArkAuthError(err)) throw err;
    invalidateArkCredentialsCache();
    const creds = await getArkCredentials({ forceRefresh: true });
    return await fn(creds);
  }
}

module.exports = {
  getArkCredentials,
  invalidateArkCredentialsCache,
  isArkAuthError,
  withArkCredentials
};
