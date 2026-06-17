#!/usr/bin/env node
/**
 * 仅测火山方舟 Seedream 图生图耗时（不走 Worker / 小程序 / 扣费）
 *
 * 用法：
 *   ARK_API_KEY=ark-xxx npm run bench:ark-seedream
 *   或在 scripts/.env.backup 中配置 ARK_API_KEY、ADMIN_USERNAME、ADMIN_PASSWORD
 *
 * 可选参数：
 *   --count-2k 10        2K 张数（默认 10）
 *   --count-4k 5         4K 张数（默认 5）
 *   --orientation landscape|portrait  画幅（默认 landscape 横图）
 *   --style-id M01       指定风格编号；默认取启用中第一条有 prompt 的模板
 *   --prompt <text>      直接指定提示词（与 --image 同时提供时可跳过 admin 登录）
 *   --image <url>        参考图 URL（默认用所选风格样图临时链）
 *   --model <id>         默认 doubao-seedream-5-0-260128
 *   --delay-ms 500       每张间隔（默认 0，测纯 API 耗时）
 */
const path = require('path')
const { loadEnvFile } = require('./adminApiCredentials')
const { resolveSeedreamOutputSize } = require('../cloudfunctions/lib/seedreamOutputSize')

const ARK_IMAGES_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const DEFAULT_MODEL = 'doubao-seedream-5-0-260128'
const GENERATION_TIMEOUT_MS = 120000

const SIZE_2K_TIER = '2k'
const SIZE_4K_TIER = '4k'

function parseArgs(argv) {
  const opts = {
    count2k: 10,
    count4k: 5,
    orientation: 'landscape',
    styleId: '',
    prompt: '',
    image: '',
    model: DEFAULT_MODEL,
    delayMs: 0
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--count-2k') opts.count2k = Math.max(0, Number(argv[++i]) || 0)
    else if (arg === '--count-4k') opts.count4k = Math.max(0, Number(argv[++i]) || 0)
    else if (arg === '--orientation') opts.orientation = String(argv[++i] || 'landscape')
    else if (arg === '--style-id') opts.styleId = String(argv[++i] || '').trim()
    else if (arg === '--prompt') opts.prompt = String(argv[++i] || '').trim()
    else if (arg === '--image') opts.image = String(argv[++i] || '').trim()
    else if (arg === '--model') opts.model = String(argv[++i] || '').trim()
    else if (arg === '--delay-ms') opts.delayMs = Math.max(0, Number(argv[++i]) || 0)
    else if (arg === '--help' || arg === '-h') opts.help = true
  }
  return opts
}

function loadEnv() {
  const files = [
    path.join(__dirname, 'env.backup'),
    path.join(__dirname, '.env.backup'),
    path.join(__dirname, '..', '.env.backup')
  ]
  let merged = {}
  for (const file of files) {
    merged = { ...merged, ...loadEnvFile(file) }
  }
  for (const key of Object.keys(process.env)) {
    if (process.env[key]) merged[key] = process.env[key]
  }
  return merged
}

async function postAdmin(api, body, token) {
  const res = await fetch(api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || JSON.stringify(json))
  return json.data
}

async function loginAdmin(env) {
  const api = env.ADMIN_API_URL
  if (!api) throw new Error('缺少 ADMIN_API_URL')
  const username = env.ADMIN_USERNAME
  const password = env.ADMIN_PASSWORD
  if (!username || !password) {
    throw new Error('缺少 ADMIN_USERNAME / ADMIN_PASSWORD（scripts/.env.backup）')
  }
  const data = await postAdmin(api, { action: 'login', username, password })
  return { api, token: data.token }
}

async function fetchStyleTemplate(api, token, styleId) {
  const data = await postAdmin(api, { action: 'styles.list', page: 1, pageSize: 100 }, token)
  const list = data.list || data.rows || data || []
  if (!Array.isArray(list)) throw new Error('styles.list 返回格式异常')
  const enabled = list.filter((row) => row && row.enabled !== false && String(row.prompt || '').trim())
  if (!enabled.length) throw new Error('未找到带 prompt 的启用风格')
  if (styleId) {
    const hit = enabled.find((row) => String(row.id || '').trim() === styleId)
    if (!hit) throw new Error(`未找到风格 ${styleId}`)
    return hit
  }
  return enabled[0]
}

function pickImageUrl(style, override) {
  if (override) return override
  const url = String(
    style.sampleDisplayUrl || style.sampleUrl || style.sampleFileId || ''
  ).trim()
  if (!url) throw new Error(`风格 ${style.id} 缺少样图 URL，请传 --image`)
  if (url.startsWith('cloud://')) {
    throw new Error('样图为 cloud://，请传可公网访问的 --image，或先用后台样图 HTTPS 地址')
  }
  return url
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stats(samples) {
  if (!samples.length) return null
  const sorted = samples.slice().sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const mid = Math.floor(sorted.length / 2)
  const p50 = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return {
    n: sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    avgMs: Math.round(sum / sorted.length),
    p50Ms: Math.round(p50)
  }
}

async function generateOnce(apiKey, { model, prompt, image, size }) {
  const started = Date.now()
  const payload = {
    model,
    prompt,
    image,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: false,
    size
  }
  const res = await fetch(ARK_IMAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS)
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 500) }
  }
  const elapsed = Date.now() - started
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`)
    err.elapsed = elapsed
    throw err
  }
  const first = body.data && body.data[0]
  if (!first || !first.url) {
    const err = new Error(`未返回图片 URL: ${JSON.stringify(body).slice(0, 300)}`)
    err.elapsed = elapsed
    throw err
  }
  return { elapsed, resultUrl: first.url, reportedSize: first.size || '' }
}

async function runBatch(label, count, ctx) {
  const samples = []
  const failures = []
  console.log(`\n=== ${label} × ${count}（size=${ctx.size}）===`)
  for (let i = 0; i < count; i += 1) {
    const idx = i + 1
    try {
      const { elapsed, resultUrl, reportedSize } = await generateOnce(ctx.apiKey, ctx)
      samples.push(elapsed)
      console.log(
        `  [${idx}/${count}] OK ${elapsed}ms` +
          (reportedSize ? ` · 返回 ${reportedSize}` : '') +
          ` · ${resultUrl.slice(0, 72)}...`
      )
    } catch (err) {
      const elapsed = err.elapsed != null ? err.elapsed : 0
      failures.push({ idx, elapsed, message: err.message })
      console.log(`  [${idx}/${count}] FAIL ${elapsed}ms · ${err.message}`)
    }
    if (ctx.delayMs > 0 && i < count - 1) await sleep(ctx.delayMs)
  }
  const st = stats(samples)
  console.log(`--- ${label} 汇总 ---`)
  if (st) {
    console.log(
      `  成功 ${st.n}/${count} · 平均 ${st.avgMs}ms · 中位 ${st.p50Ms}ms · 最快 ${st.minMs}ms · 最慢 ${st.maxMs}ms`
    )
  } else {
    console.log('  全部失败')
  }
  return { label, size: ctx.size, count, samples, failures, stats: st }
}

function printHelp() {
  console.log(`用法: ARK_API_KEY=ark-xxx npm run bench:ark-seedream

仅调用火山方舟 images/generations，统计每张耗时。
从后台拉取一条启用风格的 prompt；参考图默认用该风格样图 HTTPS 地址。

参数:
  --count-2k 10
  --count-4k 5
  --orientation landscape|portrait|auto
  --style-id M01
  --image <https://...>
  --model ${DEFAULT_MODEL}
  --delay-ms 0
`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }

  const env = loadEnv()
  const apiKey = String(env.ARK_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('缺少 ARK_API_KEY：写入 scripts/.env.backup 或环境变量')
  }

  const defaultImage =
    'https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imageToimage.png'
  const defaultPrompt =
    'professional portrait photo, studio soft lighting, natural skin texture, ' +
    'confident expression, shallow depth of field, high quality'

  let style = { id: 'bench', name: 'benchmark' }
  let prompt = String(opts.prompt || '').trim()
  let image = String(opts.image || '').trim()

  if (prompt && image) {
    // 跳过 admin
  } else {
    const { api, token } = await loginAdmin(env)
    style = await fetchStyleTemplate(api, token, opts.styleId)
    prompt = String(style.prompt || '').trim()
    image = pickImageUrl(style, opts.image)
  }

  if (!prompt) prompt = defaultPrompt
  if (!image) image = defaultImage
  const model = opts.model || DEFAULT_MODEL

  const size2k = resolveSeedreamOutputSize(SIZE_2K_TIER, opts.orientation)
  const size4k = resolveSeedreamOutputSize(SIZE_4K_TIER, opts.orientation)
  if (!size2k || !size4k) {
    throw new Error('orientation=auto 时不适合本基准（需固定像素 size），请用 landscape 或 portrait')
  }

  console.log('方舟 Seedream 耗时基准（仅 API，串行）')
  console.log(`  模型: ${model}`)
  console.log(`  风格: ${style.id} ${style.name || ''}`)
  console.log(`  画幅: ${opts.orientation}`)
  console.log(`  2K size: ${size2k}`)
  console.log(`  4K size: ${size4k}`)
  console.log(`  prompt 前 80 字: ${prompt.slice(0, 80)}...`)
  console.log(`  参考图: ${image.slice(0, 96)}...`)

  const baseCtx = { apiKey, model, prompt, image, delayMs: opts.delayMs }
  const result2k = await runBatch('2K', opts.count2k, { ...baseCtx, size: size2k })
  const result4k = await runBatch('4K', opts.count4k, { ...baseCtx, size: size4k })

  console.log('\n======== 总览 ========')
  for (const row of [result2k, result4k]) {
    if (row.stats) {
      console.log(`${row.label} (${row.size}): 平均 ${row.stats.avgMs}ms，${row.stats.n}/${row.count} 成功`)
    } else {
      console.log(`${row.label}: 0/${row.count} 成功`)
    }
  }
}

main().catch((err) => {
  console.error('[bench:ark-seedream] 失败:', err.message || err)
  process.exit(1)
})
