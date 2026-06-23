#!/usr/bin/env node
/**
 * 用火山方舟 Seedream 文生图为各风格生成 2K 竖图样图，写入本地并记录 manifest。
 *
 * 用法：
 *   npm run generate:seedream-samples -- --dry-run
 *   npm run generate:seedream-samples -- --only F01
 *   npm run generate:seedream-samples -- --concurrency 10
 *   npm run generate:seedream-samples -- --retry-failed
 *   npm run generate:seedream-samples -- --upload
 *
 * 环境：scripts/.env.backup 需 ARK_API_KEY、ADMIN_USERNAME、ADMIN_PASSWORD
 */
const fs = require('fs')
const path = require('path')
const { resolveCredentials, loadEnvFile } = require('./adminApiCredentials')
const { cropSampleToJpeg } = require('./lib/styleSampleLocal')
const { uploadStyleSampleDirect } = require('./lib/styleSampleDirectUpload')
const { ensureStyleAssetsDirs } = require('./styleAssetsDir')
const { resolveSeedreamOutputSize } = require('../cloudfunctions/lib/seedreamOutputSize')

const ARK_IMAGES_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const DEFAULT_MODEL = 'doubao-seedream-5-0-260128'
const MANIFEST_NAME = 'seedream-manifest.json'
const GENERATION_TIMEOUT_MS = 120000
const DOWNLOAD_TIMEOUT_MS = 60000

const SAMPLE_PROMPT_SUFFIX = '，竖版单人写真效果参考图，构图居中，无文字，无水印'

function loadMergedEnv() {
  const files = [
    path.join(__dirname, '.env.backup'),
    path.join(__dirname, 'env.backup'),
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

function parseArgs(argv) {
  const opts = {
    only: [],
    concurrency: 10,
    orientation: 'portrait',
    model: DEFAULT_MODEL,
    referenceImage: '',
    dryRun: false,
    skipExisting: false,
    retryFailed: false,
    upload: false,
    uploadOnly: false,
    help: false
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--only') {
      opts.only = String(argv[++i] || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    } else if (arg === '--concurrency') opts.concurrency = Math.max(1, Number(argv[++i]) || 10)
    else if (arg === '--orientation') opts.orientation = String(argv[++i] || 'portrait')
    else if (arg === '--model') opts.model = String(argv[++i] || '').trim()
    else if (arg === '--image') opts.referenceImage = String(argv[++i] || '').trim()
    else if (arg === '--dry-run') opts.dryRun = true
    else if (arg === '--skip-existing') opts.skipExisting = true
    else if (arg === '--retry-failed') opts.retryFailed = true
    else if (arg === '--upload') opts.upload = true
    else if (arg === '--upload-only') {
      opts.upload = true
      opts.uploadOnly = true
    }
    else if (arg === '--help' || arg === '-h') opts.help = true
  }
  return opts
}

function buildStyleSamplePrompt(style) {
  const core = String(style.prompt || '').trim()
  if (!core) throw new Error('缺少 prompt')
  return `${core}${SAMPLE_PROMPT_SUFFIX}`
}

function manifestPathFor(outDir) {
  return path.join(outDir, MANIFEST_NAME)
}

function loadManifest(outDir) {
  const p = manifestPathFor(outDir)
  if (!fs.existsSync(p)) {
    return {
      version: 1,
      updatedAt: null,
      results: []
    }
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function saveManifest(outDir, manifest) {
  manifest.updatedAt = new Date().toISOString()
  fs.writeFileSync(manifestPathFor(outDir), JSON.stringify(manifest, null, 2), 'utf8')
}

function upsertManifestResult(manifest, row) {
  const list = manifest.results || []
  const idx = list.findIndex((r) => r.id === row.id)
  if (idx >= 0) list[idx] = { ...list[idx], ...row }
  else list.push(row)
  manifest.results = list
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

async function loginAdmin(creds) {
  const data = await postAdmin(creds.api, {
    action: 'login',
    username: creds.username,
    password: creds.password
  })
  return data.token
}

async function fetchAllStyles(api, token) {
  const data = await postAdmin(api, { action: 'styles.list', page: 1, pageSize: 100 }, token)
  const list = data.list || []
  return list
    .filter((row) => row && row.enabled !== false && String(row.prompt || '').trim())
    .sort((a, b) => {
      const sa = Number(a.sort) || 0
      const sb = Number(b.sort) || 0
      if (sa !== sb) return sa - sb
      return String(a.id || '').localeCompare(String(b.id || ''))
    })
}

function classifyError(status, bodyText, errMsg) {
  const text = String(bodyText || errMsg || '')
  if (status === 429) return '429-rate-limit'
  if (/timeout|aborted|AbortError/i.test(text)) return 'timeout'
  if (status >= 500) return `${status}-server`
  if (status === 403) return '403-forbidden'
  if (status === 401) return '401-auth'
  if (/rate limit|too many|throttl|并发|AccountRateLimit/i.test(text)) return 'rate-limit-body'
  if (status >= 400) return `${status}-client`
  return 'other'
}

async function callSeedream(apiKey, { model, prompt, image, size, timeoutMs }) {
  const started = Date.now()
  const payload = {
    model,
    prompt,
    size,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: false
  }
  if (image) payload.image = image
  const res = await fetch(ARK_IMAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  })
  const text = await res.text()
  const elapsedMs = Date.now() - started
  if (!res.ok) {
    const kind = classifyError(res.status, text)
    const err = new Error(`HTTP ${res.status} (${kind}): ${text.slice(0, 240)}`)
    err.elapsedMs = elapsedMs
    err.kind = kind
    throw err
  }
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`响应非 JSON: ${text.slice(0, 200)}`)
  }
  const first = body.data && body.data[0]
  if (!first || !first.url) {
    throw new Error(`未返回图片 URL: ${text.slice(0, 240)}`)
  }
  return { elapsedMs, resultUrl: first.url, reportedSize: first.size || '' }
}

async function downloadImage(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) throw new Error('下载为空')
  return buf
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < items.length) {
      const i = nextIndex
      nextIndex += 1
      results[i] = await worker(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  await Promise.all(workers)
  return results
}

async function generateOneStyle(style, ctx) {
  const styleId = String(style.id || '').trim().toUpperCase()
  const outPath = path.join(ctx.outDir, `${styleId}.jpg`)
  const label = `${styleId} ${style.name || ''}`.trim()

  if (ctx.skipExisting && fs.existsSync(outPath)) {
    return {
      id: styleId,
      _id: style._id || '',
      name: style.name || '',
      status: 'skipped',
      localPath: outPath,
      reason: 'file-exists'
    }
  }

  const prompt = buildStyleSamplePrompt(style)
  const started = Date.now()
  try {
    console.log(`▶ 生成 ${label}`)
    const { elapsedMs: apiMs, resultUrl, reportedSize } = await callSeedream(ctx.apiKey, {
      model: ctx.model,
      prompt,
      ...(ctx.referenceImage ? { image: ctx.referenceImage } : {}),
      size: ctx.size,
      timeoutMs: ctx.generationTimeoutMs
    })
    const buf = await downloadImage(resultUrl, ctx.downloadTimeoutMs)
    fs.writeFileSync(outPath, buf)
    const totalMs = Date.now() - started
    console.log(`  ✓ ${label} · ${totalMs}ms · ${reportedSize || ctx.size} · ${outPath}`)
    return {
      id: styleId,
      _id: style._id || '',
      name: style.name || '',
      status: 'ok',
      localPath: outPath,
      promptPreview: prompt.slice(0, 120),
      apiMs,
      totalMs,
      reportedSize: reportedSize || ctx.size,
      resultUrl
    }
  } catch (err) {
    const totalMs = Date.now() - started
    console.error(`  ✗ ${label}: ${err.message}`)
    return {
      id: styleId,
      _id: style._id || '',
      name: style.name || '',
      status: 'failed',
      error: err.message,
      kind: err.kind || classifyError(0, '', err.message),
      promptPreview: prompt.slice(0, 120),
      totalMs,
      apiMs: err.elapsedMs || null
    }
  }
}

async function uploadOneSample(api, token, style, localPath, workDir) {
  const styleId = String(style.id || '').toUpperCase()
  const thumbPath = path.join(workDir, `${styleId}-thumb.jpg`)

  cropSampleToJpeg(localPath, thumbPath)
  const thumbBody = fs.readFileSync(thumbPath)
  const hdBody = fs.readFileSync(localPath)

  const uploaded = await uploadStyleSampleDirect(postAdmin, api, token, {
    thumbBody,
    hdBody,
    mimeType: 'image/jpeg',
    thumbFilename: `${styleId}-thumb.jpg`,
    hdFilename: `${styleId}.jpg`
  })

  await postAdmin(
    api,
    {
      action: 'styles.update',
      _id: style._id,
      sampleFileId: uploaded.sampleFileId,
      sampleHdFileId: uploaded.sampleHdFileId
    },
    token
  )
  return {
    sampleFileId: uploaded.sampleFileId,
    sampleHdFileId: uploaded.sampleHdFileId,
    sampleUrl: uploaded.sampleUrl,
    sampleHdUrl: uploaded.sampleHdUrl
  }
}

async function runUploadPhase(creds, styles, manifest, outDir, { onlyIds } = {}) {
  const token = await loginAdmin(creds)
  const byId = new Map(styles.map((s) => [String(s.id || '').toUpperCase(), s]))
  const workDir = path.join(outDir, '.upload-work')
  fs.mkdirSync(workDir, { recursive: true })
  let okRows = (manifest.results || []).filter(
    (r) =>
      r.localPath &&
      fs.existsSync(r.localPath) &&
      (r.status === 'ok' || r.status === 'skipped')
  )

  if (onlyIds && onlyIds.size) {
    okRows = okRows.filter((r) => onlyIds.has(String(r.id || '').toUpperCase()))
    for (const id of onlyIds) {
      const upper = String(id || '').toUpperCase()
      if (okRows.some((r) => r.id === upper)) continue
      const localPath = path.join(outDir, `${upper}.jpg`)
      if (fs.existsSync(localPath)) {
        okRows.push({ id: upper, localPath, status: 'ok' })
      }
    }
  }

  console.log(`\n══ 上传样图（${okRows.length} 条）══`)
  for (const row of okRows) {
    const style = byId.get(row.id)
    if (!style || !style._id) {
      console.error(`  ✗ ${row.id}: 云库无 _id`)
      continue
    }
    const localPath = row.localPath || path.join(outDir, `${row.id}.jpg`)
    if (!fs.existsSync(localPath)) {
      console.error(`  ✗ ${row.id}: 找不到 ${localPath}`)
      continue
    }
    try {
      console.log(`▶ 上传 ${row.id} ${style.name || ''}`)
      const uploaded = await uploadOneSample(creds.api, token, style, localPath, workDir)
      row.uploadStatus = 'ok'
      row.sampleFileId = uploaded.sampleFileId
      row.sampleHdFileId = uploaded.sampleHdFileId
      row.sampleUrl = uploaded.sampleUrl
      row.sampleHdUrl = uploaded.sampleHdUrl
      row.uploadedAt = new Date().toISOString()
      console.log(`  ✓ 缩略 ${uploaded.sampleFileId}`)
      console.log(`  ✓ 高清 ${uploaded.sampleHdFileId}`)
    } catch (err) {
      row.uploadStatus = 'failed'
      row.uploadError = err.message
      console.error(`  ✗ ${row.id}: ${err.message}`)
    }
  }
  saveManifest(outDir, manifest)
}

function printHelp() {
  console.log(`用法: npm run generate:seedream-samples -- [选项]

选项:
  --only F01,F02       只处理指定风格 ID
  --concurrency 10     并发数（默认 10）
  --orientation portrait|landscape  默认 portrait（2K 竖图 1728x2304）
  --model <id>         默认 ${DEFAULT_MODEL}
  --image <url>        可选：图生图参考图（默认文生图，不传 image）
  --skip-existing      本地已有 JPG 则跳过
  --retry-failed       只重跑 manifest 中 status=failed 的项
  --upload             生成完成后上传 manifest 中成功项
  --upload-only        仅上传本地已有 JPG（不调用 Seedream）
  --dry-run            只列出待处理风格
`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }

  const creds = resolveCredentials(process.argv.slice(2))
  if (!creds.api || !creds.username || !creds.password) {
    throw new Error('缺少 ADMIN 凭据（scripts/.env.backup 或 --username/--password）')
  }

  const { generated: outDir } = ensureStyleAssetsDirs()
  const size = resolveSeedreamOutputSize('2k', opts.orientation)
  if (!size) throw new Error('orientation=auto 不支持，请用 portrait 或 landscape')

  const referenceImage = opts.referenceImage.trim()
  const manifest = loadManifest(outDir)

  const token = await loginAdmin(creds)
  let styles = await fetchAllStyles(creds.api, token)

  if (opts.only.length) {
    const set = new Set(opts.only)
    styles = styles.filter((s) => set.has(String(s.id || '').toUpperCase()))
  }

  if (opts.retryFailed) {
    const failedIds = new Set(
      (manifest.results || []).filter((r) => r.status === 'failed').map((r) => r.id)
    )
    if (!failedIds.size) {
      console.log('manifest 中无 failed 项')
      return
    }
    styles = styles.filter((s) => failedIds.has(String(s.id || '').toUpperCase()))
    console.log(`重试 ${styles.length} 条: ${[...failedIds].join(', ')}`)
  }

  console.log('Seedream 风格样图文生图')
  console.log(`  输出: ${outDir}`)
  console.log(`  模型: ${opts.model}`)
  console.log(`  尺寸: ${size}`)
  console.log(`  并发: ${opts.concurrency}`)
  console.log(`  模式: ${referenceImage ? '图生图（--image）' : '文生图（无参考图）'}`)
  console.log(`  待处理: ${styles.length} 条`)

  if (opts.dryRun) {
    styles.forEach((s) => {
      console.log(`  ${s.id} [${s.gender || '-'}] ${s.name}`)
      console.log(`    prompt: ${buildStyleSamplePrompt(s).slice(0, 100)}...`)
    })
    return
  }

  if (opts.uploadOnly || (opts.upload && opts.skipExisting && !opts.only.length)) {
    const allStyles = await fetchAllStyles(creds.api, token)
    await runUploadPhase(creds, allStyles, manifest, outDir)
    return
  }

  if (opts.upload && opts.only.length) {
    const onlySet = new Set(opts.only.map((id) => String(id).toUpperCase()))
    const missing = [...onlySet].filter((id) => !fs.existsSync(path.join(outDir, `${id}.jpg`)))
    if (!missing.length) {
      const allStyles = await fetchAllStyles(creds.api, token)
      await runUploadPhase(creds, allStyles, manifest, outDir, { onlyIds: onlySet })
      return
    }
    throw new Error(`上传缺少本地文件: ${missing.map((id) => `${id}.jpg`).join(', ')}`)
  }

  const uploadOnly =
    opts.upload &&
    !styles.length &&
    (manifest.results || []).some((r) => r.status === 'ok' && r.localPath)

  if (uploadOnly) {
    const allStyles = await fetchAllStyles(creds.api, token)
    await runUploadPhase(creds, allStyles, manifest, outDir)
    return
  }

  if (!styles.length) {
    console.log('没有可处理的风格')
    return
  }

  const apiKey = String(loadMergedEnv().ARK_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('缺少 ARK_API_KEY（写入 scripts/.env.backup，勿提交 git）')
  }

  manifest.model = opts.model
  manifest.size = size
  manifest.concurrency = opts.concurrency
  manifest.mode = referenceImage ? 'i2i' : 't2i'
  if (referenceImage) manifest.referenceImage = referenceImage
  else delete manifest.referenceImage

  const ctx = {
    apiKey,
    model: opts.model,
    referenceImage,
    size,
    outDir,
    skipExisting: opts.skipExisting,
    generationTimeoutMs: GENERATION_TIMEOUT_MS,
    downloadTimeoutMs: DOWNLOAD_TIMEOUT_MS
  }

  const results = await mapConcurrent(styles, opts.concurrency, (style) => generateOneStyle(style, ctx))

  for (const row of results) {
    upsertManifestResult(manifest, row)
  }
  saveManifest(outDir, manifest)

  const ok = results.filter((r) => r.status === 'ok').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length
  console.log(`\n完成: 成功 ${ok} / 跳过 ${skipped} / 失败 ${failed}`)
  console.log(`清单: ${manifestPathFor(outDir)}`)

  if (failed > 0) {
    console.log('失败项:')
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`  ${r.id}: [${r.kind}] ${r.error}`))
  }

  if (opts.upload && ok > 0) {
    const allStyles = await fetchAllStyles(creds.api, token)
    await runUploadPhase(creds, allStyles, manifest, outDir)
  }

  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('[generate:seedream-samples] 失败:', err.message || err)
  process.exit(1)
})
