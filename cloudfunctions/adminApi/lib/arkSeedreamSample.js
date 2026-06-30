/**
 * 火山方舟 Seedream 文生图 / 图生图（风格样图）
 */
const { withArkCredentials } = require('./arkCredentials')
const { DEFAULT_SEEDREAM_MODEL_ID } = require('./portraitEngineConfig')
const { postJson, getBuffer } = require('./httpRequest')

const ARK_IMAGES_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const GENERATION_TIMEOUT_MS = 90000
const DOWNLOAD_TIMEOUT_MS = 30000
const DEFAULT_I2I_IMAGE_URL =
  'https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imageToimage.png'

const SAMPLE_PROMPT_SUFFIX = '，竖版单人写真效果参考图，构图居中，无文字，无水印'

function buildStyleSamplePrompt(core) {
  const text = String(core || '').trim()
  if (!text) throw new Error('请先填写提示词')
  return `${text}${SAMPLE_PROMPT_SUFFIX}`
}

function extractArkError(status, bodyText) {
  let nested = {}
  try {
    const parsed = JSON.parse(bodyText)
    nested = (parsed.error && typeof parsed.error === 'object' ? parsed.error : parsed) || {}
  } catch {
    /* ignore */
  }
  const code = String(nested.code || '').trim()
  const message = String(nested.message || bodyText || '').trim()
  if (code === 'ModelNotOpen' || /has not activated the model/i.test(message)) {
    return new Error('方舟账号未开通 Seedream 模型，请在火山方舟控制台开通后再试')
  }
  if (code === 'InvalidApiKey' || /invalid.*api.*key/i.test(message)) {
    return new Error('方舟 API Key 无效，请在后台平台配置中检查智绘引擎密钥')
  }
  if (code === 'AccountOverdueError' || /overdue balance/i.test(message)) {
    return new Error('方舟账户欠费，请充值后再试')
  }
  if (message) return new Error(message)
  return new Error(`Seedream 请求失败 HTTP ${status}`)
}

async function downloadImageBuffer(url) {
  const res = await getBuffer(url, DOWNLOAD_TIMEOUT_MS)
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`下载生成图失败 HTTP ${res.status}`)
  }
  if (!res.buffer.length) throw new Error('下载生成图为空')
  return res.buffer
}

async function parseArkImageResponse(res, fallbackSize) {
  if (res.status < 200 || res.status >= 300) {
    throw extractArkError(res.status, res.text)
  }

  let body
  try {
    body = JSON.parse(res.text)
  } catch {
    throw new Error(`Seedream 响应非 JSON: ${res.text.slice(0, 200)}`)
  }

  const first = body.data && body.data[0]
  if (!first || !first.url) {
    throw new Error(`Seedream 未返回图片 URL: ${res.text.slice(0, 240)}`)
  }

  const buffer = await downloadImageBuffer(first.url)
  return {
    buffer,
    resultUrl: first.url,
    reportedSize: first.size || fallbackSize || 'auto'
  }
}

async function generateSeedreamStyleSample(prompt, options = {}) {
  const promptText = buildStyleSamplePrompt(prompt)
  const modelId = options.modelId || DEFAULT_SEEDREAM_MODEL_ID
  const size = options.size ? String(options.size).trim() : ''

  const payload = {
    model: modelId,
    prompt: promptText,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: false,
    logo_info: { add_logo: false }
  }
  if (size) payload.size = size

  return withArkCredentials(async ({ apiKey }) => {
    const res = await postJson(
      ARK_IMAGES_URL,
      payload,
      { Authorization: `Bearer ${apiKey}` },
      GENERATION_TIMEOUT_MS
    )
    const parsed = await parseArkImageResponse(res, size)
    return {
      ...parsed,
      promptPreview: promptText.slice(0, 120)
    }
  })
}

/** 图生图（与 Worker arkSeedream 请求体一致） */
async function generateSeedreamI2iSample(prompt, imageUrl, options = {}) {
  const promptText = String(prompt || '').trim()
  const image = String(imageUrl || '').trim()
  if (!promptText) throw new Error('请先填写提示词')
  if (!image) throw new Error('缺少参考图 URL')

  const modelId = options.modelId || DEFAULT_SEEDREAM_MODEL_ID
  const size = options.size ? String(options.size).trim() : ''

  const payload = {
    model: modelId,
    prompt: promptText,
    image,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: false,
    logo_info: { add_logo: false }
  }
  if (size) payload.size = size

  return withArkCredentials(async ({ apiKey }) => {
    const res = await postJson(
      ARK_IMAGES_URL,
      payload,
      { Authorization: `Bearer ${apiKey}` },
      GENERATION_TIMEOUT_MS
    )
    const parsed = await parseArkImageResponse(res, size)
    return {
      ...parsed,
      promptPreview: promptText.slice(0, 120)
    }
  })
}

module.exports = {
  SAMPLE_PROMPT_SUFFIX,
  DEFAULT_I2I_IMAGE_URL,
  buildStyleSamplePrompt,
  generateSeedreamStyleSample,
  generateSeedreamI2iSample
}
