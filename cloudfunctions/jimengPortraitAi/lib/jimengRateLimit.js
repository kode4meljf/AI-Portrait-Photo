/**
 * 即梦 API 调用节流（submit / query 共用配额）
 * 环境变量 JIMENG_MIN_INTERVAL_MS：两次调用最小间隔，默认 1000（QPS≈1）
 * 提额后改为 500 即可（QPS≈2）
 */

let lastCallAt = 0;
let callChain = Promise.resolve();

function getMinIntervalMs() {
  const n = Number(process.env.JIMENG_MIN_INTERVAL_MS);
  if (Number.isFinite(n) && n >= 500) return Math.floor(n);
  return 1000;
}

function isJimengRateLimitCode(code) {
  const c = Number(code);
  return c === 50429 || c === 50430;
}

function isJimengRateLimitError(err) {
  if (!err) return false;
  if (err.rateLimited) return true;
  if (err.response && err.response.status === 429) return true;
  const data = err.response && err.response.data;
  if (data && isJimengRateLimitCode(data.code)) return true;
  const msg = String(err.message || '');
  return /50429|50430|限流|QPS|rate limit|too many/i.test(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 同一云函数实例内串行，保证相邻两次即梦 API 调用间隔 ≥ minInterval */
async function throttleJimengApi(label) {
  const minInterval = getMinIntervalMs();
  callChain = callChain.then(async () => {
    const wait = lastCallAt + minInterval - Date.now();
    if (wait > 0) {
      console.log(`[jimengPortraitAi/rateLimit] 等待 ${wait}ms 后 ${label || 'api'}`);
      await sleep(wait);
    }
    lastCallAt = Date.now();
  });
  return callChain;
}

/**
 * 节流 + 限流响应自动重试
 * @param {string} label submit | query
 * @param {() => Promise<any>} fn
 */
async function withJimengRateLimit(label, fn, options = {}) {
  const maxRetries = options.maxRetries != null ? options.maxRetries : 3;
  const minInterval = getMinIntervalMs();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttleJimengApi(label);
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt >= maxRetries;
      if (!isJimengRateLimitError(err) || isLast) throw err;
      const backoff = minInterval * (attempt + 1);
      console.warn(
        `[jimengPortraitAi/rateLimit] ${label} 触发限流，${backoff}ms 后重试 (${attempt + 1}/${maxRetries})`
      );
      await sleep(backoff);
    }
  }
  return null;
}

module.exports = {
  getMinIntervalMs,
  isJimengRateLimitCode,
  isJimengRateLimitError,
  throttleJimengApi,
  withJimengRateLimit
};
