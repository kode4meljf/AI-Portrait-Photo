/**
 * 火山方舟 Seedream 5.0 图生图（同步 images/generations）
 */
const axios = require('axios');
const { withArkCredentials } = require('./arkCredentials');
const { DEFAULT_SEEDREAM_MODEL_ID } = require('./portraitEngineConfig');

const ARK_IMAGES_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
/** 智绘 generating 单轮：只等 API，与 WORKER_BUDGET(55s) 对齐 */
const GENERATION_TIMEOUT_MS = 52000;
/** Materializer 下载方舟临时 URL */
const DOWNLOAD_TIMEOUT_MS = 30000;

function formatSeedreamSize(width, height) {
  const w = Math.floor(Number(width));
  const h = Math.floor(Number(height));
  if (w > 0 && h > 0) return `${w}x${h}`;
  return '';
}

async function downloadSeedreamImage(url) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS
  });
  return Buffer.from(response.data);
}

function extractArkErrorBody(err) {
  const data = err && err.response && err.response.data;
  if (!data) return { code: '', message: String((err && err.message) || '') };
  const nested = data.error && typeof data.error === 'object' ? data.error : data;
  return {
    code: String(nested.code || data.code || '').trim(),
    message: String(nested.message || data.message || (err && err.message) || '').trim()
  };
}

function toArkSeedreamError(err) {
  const { code, message } = extractArkErrorBody(err);
  if (code === 'ModelNotOpen' || /has not activated the model/i.test(message)) {
    const modelMatch = message.match(/model\s+([^\s.]+)/i);
    const model = modelMatch ? modelMatch[1] : DEFAULT_SEEDREAM_MODEL_ID;
    return new Error(
      `方舟账号未开通模型 ${model}，请在火山方舟控制台「模型广场」开通该模型后再试`
    );
  }
  if (code === 'InvalidApiKey' || /invalid.*api.*key/i.test(message)) {
    return new Error('方舟 API Key 无效，请在后台平台配置中检查智绘引擎密钥');
  }
  if (message) return new Error(message);
  return err;
}

function buildSeedreamPayload(imageUrl, prompt, options = {}) {
  const modelId = options.modelId || DEFAULT_SEEDREAM_MODEL_ID;
  const promptText = String(prompt || '').trim();
  if (!promptText) throw new Error('缺少提示词');
  if (!imageUrl) throw new Error('缺少参考图 URL');

  let size = '';
  if (options.outputSize === null) {
    size = '';
  } else if (options.outputSize) {
    size = String(options.outputSize).trim();
  } else if (options.size) {
    size = String(options.size).trim();
  } else {
    size = formatSeedreamSize(options.width, options.height);
  }

  const payload = {
    model: modelId,
    prompt: promptText,
    image: imageUrl,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: false
  };
  if (size) payload.size = size;
  return { modelId, payload, size };
}

/** 仅请求方舟生图，返回临时下载 URL（由 Materializer 落库） */
async function requestSeedreamResultUrl(imageUrl, prompt, options = {}) {
  const { modelId, payload, size } = buildSeedreamPayload(imageUrl, prompt, options);

  return withArkCredentials(async ({ apiKey }) => {
    console.log('[arkSeedream] 提交图生图', modelId, size || '(auto)');

    let response;
    try {
      response = await axios({
        method: 'POST',
        url: ARK_IMAGES_URL,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        data: payload,
        timeout: GENERATION_TIMEOUT_MS
      });
    } catch (err) {
      if (err.response) {
        console.error(
          '[arkSeedream] 提交错误:',
          err.response.status,
          JSON.stringify(err.response.data).substring(0, 500)
        );
      }
      throw toArkSeedreamError(err);
    }

    const data = response.data && response.data.data;
    const first = Array.isArray(data) ? data[0] : null;
    const imageResultUrl = first && first.url;
    if (!imageResultUrl) {
      throw new Error('Seedream 未返回图片 URL');
    }
    return imageResultUrl;
  });
}

/** 兼容旧调用：生图 + 下载一体 */
async function generateSeedreamPortrait(imageUrl, prompt, options = {}) {
  const imageResultUrl = await requestSeedreamResultUrl(imageUrl, prompt, options);
  return downloadSeedreamImage(imageResultUrl);
}

module.exports = {
  formatSeedreamSize,
  requestSeedreamResultUrl,
  downloadSeedreamImage,
  generateSeedreamPortrait,
  GENERATION_TIMEOUT_MS,
  DOWNLOAD_TIMEOUT_MS
};
