/**
 * 即梦写真 API（异步 i2i_portrait_photo，HMAC-SHA256 签名）
 */
const axios = require('axios');
const crypto = require('crypto');

const JIMENG_ENDPOINT = 'visual.volcengineapi.com';
const JIMENG_SERVICE = 'cv';
const JIMENG_REGION = 'cn-north-1';
const JIMENG_VERSION = '2022-08-31';

const POLL_INTERVAL_MS = 3000;
const DEFAULT_POLL_BUDGET_MS = 45000;

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}

function getXDate() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function urlQuote(str) {
  return encodeURIComponent(str)
    .replace(/%2D/g, '-')
    .replace(/%5F/g, '_')
    .replace(/%2E/g, '.')
    .replace(/%7E/g, '~');
}

function jsonStringifySpaced(obj) {
  const keys = Object.keys(obj);
  const parts = keys.map((k) => {
    const v = obj[k];
    let vStr;
    if (typeof v === 'string') vStr = JSON.stringify(v);
    else if (typeof v === 'number' && !Number.isInteger(v)) vStr = String(v);
    else if (typeof v === 'number') vStr = String(v);
    else if (typeof v === 'boolean') vStr = (v ? 'true' : 'false');
    else if (v === null) vStr = 'null';
    else if (Array.isArray(v)) vStr = '[' + v.map((x) => jsonStringifySpaced(x)).join(', ') + ']';
    else if (typeof v === 'object') vStr = jsonStringifySpaced(v);
    else vStr = String(v);
    return JSON.stringify(k) + ': ' + vStr;
  });
  return '{' + parts.join(', ') + '}';
}

function canonicalQuery(query) {
  const res = [];
  for (const key of Object.keys(query)) {
    const value = String(query[key]);
    res.push([urlQuote(key), urlQuote(value)]);
  }
  res.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  return res.map((item) => item[0] + '=' + item[1]).join('&');
}

function getSigningKey(sk, date, region, service) {
  let k = hmacSha256(sk, date);
  k = hmacSha256(k, region);
  k = hmacSha256(k, service);
  return hmacSha256(k, 'request');
}

function signRequest(accessKey, secretKey, method, endpoint, service, region, queryParamsObj, payload) {
  const xDate = getXDate();
  const dateStr = xDate.substring(0, 8);
  const payloadStr = jsonStringifySpaced(payload);
  const bodyHash = sha256Hex(payloadStr);

  const headers = {
    'Content-Type': 'application/json',
    Host: endpoint
  };
  headers['X-Date'] = xDate;
  headers['X-Content-Sha256'] = bodyHash;

  const signedHeaders = {};
  for (const k of Object.keys(headers)) {
    if (['Content-Type', 'Content-Md5', 'Host'].includes(k) || k.startsWith('X-')) {
      signedHeaders[k.toLowerCase()] = headers[k];
    }
  }

  if ('host' in signedHeaders) {
    const ci = signedHeaders.host.indexOf(':');
    if (ci !== -1) {
      const port = signedHeaders.host.substring(ci + 1);
      if (port === '80' || port === '443') {
        signedHeaders.host = signedHeaders.host.substring(0, ci);
      }
    }
  }

  const sortedKeys = Object.keys(signedHeaders).sort();
  let signedStr = '';
  for (const k of sortedKeys) signedStr += k + ':' + signedHeaders[k] + '\n';
  const signedHStr = sortedKeys.join(';');

  const cqs = canonicalQuery(queryParamsObj);
  const canonicalReq = [method, '/', cqs, signedStr, signedHStr, bodyHash].join('\n');

  const credentialScope = [dateStr, region, service, 'request'].join('/');
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256Hex(canonicalReq)].join('\n');

  const signingKey = getSigningKey(secretKey, dateStr, region, service);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  headers.Authorization =
    'HMAC-SHA256' +
    ' Credential=' +
    accessKey +
    '/' +
    credentialScope +
    ', SignedHeaders=' +
    signedHStr +
    ', Signature=' +
    signature;

  return { headers, queryString: cqs, body: payloadStr };
}

function getCredentials() {
  const accessKey = process.env.VOLC_ACCESS_KEY;
  const secretKey = process.env.VOLC_SECRET_KEY;
  if (!accessKey || !secretKey) {
    throw new Error('缺少环境变量 VOLC_ACCESS_KEY 或 VOLC_SECRET_KEY');
  }
  return { accessKey, secretKey };
}

async function submitJimengTask(imageUrl, prompt, options = {}) {
  const { accessKey, secretKey } = getCredentials();

  const queryParams = {
    Action: 'CVSync2AsyncSubmitTask',
    Version: JIMENG_VERSION
  };

  const payload = {
    req_key: 'i2i_portrait_photo',
    image_input: imageUrl,
    prompt: prompt || '',
    width: options.width || 1024,
    height: options.height || 1024,
    gpen: options.gpen !== undefined ? options.gpen : 0.4,
    skin: options.skin !== undefined ? options.skin : 0.3,
    gen_mode: 'creative',
    seed: -1
  };

  const sig = signRequest(
    accessKey,
    secretKey,
    'POST',
    JIMENG_ENDPOINT,
    JIMENG_SERVICE,
    JIMENG_REGION,
    queryParams,
    payload
  );
  const url = `https://${JIMENG_ENDPOINT}/?${sig.queryString}`;

  console.log('[jimengPortraitAi/jimeng] 提交任务');

  let response;
  try {
    response = await axios({
      method: 'POST',
      url,
      headers: sig.headers,
      data: sig.body,
      timeout: 25000
    });
  } catch (err) {
    if (err.response) {
      console.error('[jimengPortraitAi/jimeng] 提交错误:', err.response.status, JSON.stringify(err.response.data).substring(0, 500));
    }
    throw err;
  }

  const result = response.data;
  if (result.code !== 10000) {
    throw new Error(`即梦提交失败: code=${result.code}, message=${result.message || ''}`);
  }

  const taskId = result.data && result.data.task_id;
  if (!taskId) throw new Error('即梦未返回 task_id');
  return taskId;
}

async function queryJimengTask(taskId) {
  const { accessKey, secretKey } = getCredentials();

  const queryParams = {
    Action: 'CVSync2AsyncGetResult',
    Version: JIMENG_VERSION
  };

  const reqJson = JSON.stringify({
    logo_info: { add_logo: false },
    return_url: true
  });

  const payload = {
    req_key: 'i2i_portrait_photo',
    task_id: taskId,
    req_json: reqJson
  };

  const sig = signRequest(
    accessKey,
    secretKey,
    'POST',
    JIMENG_ENDPOINT,
    JIMENG_SERVICE,
    JIMENG_REGION,
    queryParams,
    payload
  );
  const url = `https://${JIMENG_ENDPOINT}/?${sig.queryString}`;

  const response = await axios({
    method: 'POST',
    url,
    headers: sig.headers,
    data: sig.body,
    timeout: 25000
  });
  return response.data;
}

async function downloadResultBuffer(data) {
  if (data.image_urls && data.image_urls.length > 0) {
    const imgResp = await axios.get(data.image_urls[0], { responseType: 'arraybuffer', timeout: 25000 });
    return Buffer.from(imgResp.data);
  }
  if (data.binary_data_base64 && data.binary_data_base64.length > 0) {
    return Buffer.from(data.binary_data_base64[0], 'base64');
  }
  throw new Error('任务完成但没有图片数据');
}

function parseQueryResult(result) {
  if (result.code !== 10000) {
    if (result.code === 50429 || result.code === 50430) {
      return { kind: 'pending' };
    }
    throw new Error(`即梦查询失败: code=${result.code}, message=${result.message || ''}`);
  }

  const data = result.data;
  if (!data) return { kind: 'pending' };

  if (data.status === 'done') {
    return { kind: 'done', data };
  }
  if (data.status === 'in_queue' || data.status === 'generating') {
    return { kind: 'pending' };
  }
  if (data.status === 'not_found' || data.status === 'expired') {
    throw new Error(`即梦任务异常: status=${data.status}`);
  }
  return { kind: 'pending' };
}

/**
 * 在预算时间内轮询即梦任务
 * @returns {{ status: 'done', buffer: Buffer } | { status: 'pending' }}
 */
async function pollJimengTask(taskId, options = {}) {
  const budgetMs = options.budgetMs || DEFAULT_POLL_BUDGET_MS;
  const intervalMs = options.intervalMs || POLL_INTERVAL_MS;
  const skipInitialDelay = options.skipInitialDelay || false;
  const deadline = Date.now() + budgetMs;

  let first = skipInitialDelay;

  while (Date.now() < deadline) {
    if (!first) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    first = false;

    if (Date.now() >= deadline) break;

    const result = await queryJimengTask(taskId);
    console.log('[jimengPortraitAi/jimeng] 轮询:', JSON.stringify(result).substring(0, 300));

    const parsed = parseQueryResult(result);
    if (parsed.kind === 'done') {
      const buffer = await downloadResultBuffer(parsed.data);
      return { status: 'done', buffer };
    }
  }

  return { status: 'pending' };
}

module.exports = {
  submitJimengTask,
  queryJimengTask,
  pollJimengTask,
  POLL_INTERVAL_MS,
  DEFAULT_POLL_BUDGET_MS
};
