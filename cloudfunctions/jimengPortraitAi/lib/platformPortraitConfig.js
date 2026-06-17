const cloud = require('wx-server-sdk');
const {
  DEFAULT_PORTRAIT_ENGINE,
  PORTRAIT_ENGINE_SEEDREAM,
  normalizePortraitEngine
} = require('./portraitEngineConfig');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PLATFORM_SETTINGS_COL = 'platform_settings';
const PLATFORM_SETTINGS_ID = 'default';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = null;

function isCacheFresh(entry) {
  if (!entry || !entry.loadedAt) return false;
  return Date.now() - entry.loadedAt < CACHE_TTL_MS;
}

async function readPortraitSettingsFromDatabase() {
  const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get();
  const data = res.data || {};
  return {
    portraitEngine: normalizePortraitEngine(data.portraitEngine || DEFAULT_PORTRAIT_ENGINE),
    arkApiKeyConfigured: !!String(data.arkApiKey || '').trim()
  };
}

function rememberInCache(settings) {
  cache = {
    ...settings,
    loadedAt: Date.now()
  };
}

async function getPortraitPlatformConfig(options = {}) {
  const forceRefresh = !!options.forceRefresh;
  if (!forceRefresh && isCacheFresh(cache)) {
    return { ...cache, loadedAt: undefined };
  }
  const settings = await readPortraitSettingsFromDatabase();
  rememberInCache(settings);
  return settings;
}

async function getPortraitEngine(options = {}) {
  const config = await getPortraitPlatformConfig(options);
  return config.portraitEngine;
}

function assertPortraitEngineReady(config) {
  if (config.portraitEngine === PORTRAIT_ENGINE_SEEDREAM && !config.arkApiKeyConfigured) {
    const err = new Error('智绘引擎未配置方舟 API Key，请在管理后台「平台配置」中填写');
    err.code = 'PORTRAIT_ENGINE_NOT_CONFIGURED';
    throw err;
  }
}

async function assertCurrentPortraitEngineReady(options = {}) {
  const config = await getPortraitPlatformConfig(options);
  assertPortraitEngineReady(config);
  return config;
}

module.exports = {
  getPortraitPlatformConfig,
  getPortraitEngine,
  assertPortraitEngineReady,
  assertCurrentPortraitEngineReady
};
