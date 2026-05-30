const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PLATFORM_SETTINGS_COL = 'platform_settings';
const PLATFORM_SETTINGS_ID = 'default';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = null;

function readFromEnv() {
  const accessKey = String(process.env.VOLC_ACCESS_KEY || '').trim();
  const secretKey = String(process.env.VOLC_SECRET_KEY || '').trim();
  if (accessKey && secretKey) {
    return { accessKey, secretKey, source: 'env' };
  }
  return null;
}

function isCacheFresh(entry) {
  if (!entry || !entry.accessKey || !entry.secretKey) return false;
  return Date.now() - entry.loadedAt < CACHE_TTL_MS;
}

async function readFromDatabase() {
  const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get();
  const data = res.data || {};
  const accessKey = String(data.volcAccessKey || '').trim();
  const secretKey = String(data.volcSecretKey || '').trim();
  if (!accessKey || !secretKey) return null;
  return {
    accessKey,
    secretKey,
    source: 'db',
    version: data.volcKeysUpdateTime || data.updateTime || null
  };
}

function rememberInCache(creds) {
  cache = {
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    loadedAt: Date.now(),
    version: creds.version || null
  };
}

function invalidateVolcCredentialsCache() {
  cache = null;
}

/**
 * 优先环境变量（便于本地/紧急覆盖），否则读 platform_settings 并内存缓存。
 */
async function getVolcCredentials(options = {}) {
  const forceRefresh = !!options.forceRefresh;
  const envCreds = readFromEnv();
  if (envCreds) return envCreds;

  if (!forceRefresh && isCacheFresh(cache)) {
    return { accessKey: cache.accessKey, secretKey: cache.secretKey, source: 'cache' };
  }

  const dbCreds = await readFromDatabase();
  if (!dbCreds) {
    throw new Error(
      '缺少即梦密钥：请在管理后台「平台配置」填写，或配置环境变量 VOLC_ACCESS_KEY / VOLC_SECRET_KEY'
    );
  }

  rememberInCache(dbCreds);
  return { accessKey: dbCreds.accessKey, secretKey: dbCreds.secretKey, source: dbCreds.source };
}

function isVolcAuthError(err) {
  if (!err) return false;
  const status = err.response && err.response.status;
  if (status === 401 || status === 403) return true;

  const body = err.response && err.response.data;
  const text = [
    err.message,
    body && body.message,
    body && body.Message,
    body && body.error && body.error.message
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    /signature|access.?denied|invalid.?access|unauthorized|auth/i.test(text) ||
    /签名|鉴权|密钥|access.?key/i.test(text)
  );
}

async function withVolcCredentials(fn) {
  try {
    const creds = await getVolcCredentials();
    return await fn(creds);
  } catch (err) {
    if (!isVolcAuthError(err)) throw err;
    invalidateVolcCredentialsCache();
    const creds = await getVolcCredentials({ forceRefresh: true });
    return await fn(creds);
  }
}

module.exports = {
  getVolcCredentials,
  invalidateVolcCredentialsCache,
  isVolcAuthError,
  withVolcCredentials
};
