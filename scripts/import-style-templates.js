#!/usr/bin/env node
/**
 * 银梦 60 风格三阶段导入
 *
 * 阶段 1 占位入库：npm run import:styles:placeholder -- -i
 * 阶段 2 文生图样图：npm run import:styles:generate -- -i
 * 阶段 3 替换样图：  npm run import:styles:update -- -i
 *
 * 详见：node scripts/import-style-templates.js --help
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const {
  resolveCredentials,
  maybePromptCredentials,
  printCredentialHint,
  printHelp: printCredHelp,
  loadEnvFile
} = require('./adminApiCredentials')
const { parseStylePromptsMarkdownFile } = require('./parseStylePromptsMarkdown')
const {
  sleep,
  findSampleRawPath,
  cropSampleToJpeg,
  cropLandscape43ToJpeg,
  readJpegBase64
} = require('./lib/styleSampleLocal')
const { ensureStyleAssetsDirs } = require('./styleAssetsDir')

const DEFAULT_MD =
  process.env.STYLE_PROMPTS_FILE ||
  path.join(os.homedir(), 'Desktop', '银梦畅想_全60风格提示词全集_20260615.md')

const DEFAULT_RESOLUTION = '1152:1536'
const DEFAULT_LANDSCAPE_RESOLUTION = '1536:1152'
const MANIFEST_NAME = 'import-manifest.json'

function looksLikeMarkdownPath(filePath) {
  if (!filePath) return false
  return /\.md$/i.test(filePath) || fs.existsSync(filePath)
}

function parseImportArgs(argv) {
  const creds = resolveCredentials(argv)
  const flags = { ...creds.flags }
  const values = {}
  let mdFile = ''

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dry-run') flags.dryRun = true
    else if (arg === '--placeholder-only') flags.placeholderOnly = true
    else if (arg === '--generate-samples') flags.generateSamples = true
    else if (arg === '--generate-landscape') flags.generateLandscape = true
    else if (arg === '--update-samples-only') flags.updateSamplesOnly = true
    else if (arg === '--retry-failed') flags.retryFailed = true
    else if (arg === '--skip-existing') flags.skipExisting = true
    else if (arg === '--i2i-fallback') flags.i2iFallback = true
    else if (arg === '--file' || arg === '-f') values.file = argv[++i]
    else if (arg === '--placeholder') values.placeholder = argv[++i]
    else if (arg === '--work-dir') values.workDir = argv[++i]
    else if (arg === '--manifest') values.manifest = argv[++i]
    else if (arg === '--generated-dir') values.generatedDir = argv[++i]
    else if (arg === '--only') values.only = argv[++i]
    else if (arg === '--delay-ms') values.delayMs = Number(argv[++i])
    else if (arg === '--resolution') values.resolution = argv[++i]
    else if (!arg.startsWith('-') && !mdFile && !values.file) {
      mdFile = arg
    }
  }

  const isLandscape = !!(flags.generateLandscape && !flags.generateSamples)
  return {
    ...creds,
    flags,
    values,
    mdFile:
      values.file ||
      mdFile ||
      (looksLikeMarkdownPath(creds.outDir) ? creds.outDir : '') ||
      DEFAULT_MD,
    resolution:
      values.resolution ||
      (isLandscape ? DEFAULT_LANDSCAPE_RESOLUTION : DEFAULT_RESOLUTION)
  }
}

function printImportHelp() {
  console.log(`银梦风格三阶段导入（Markdown → 云库 style_templates）

推荐流程:
  1) 在 ~/Desktop/AI写真/styles-import/ 放一张任意图 placeholder.jpg
  2) npm run import:styles:placeholder -- -i     # 60 条入库，共用占位样图
  3) npm run import:styles:generate -- -i        # 纯提示词文生图 60 张（无参考图）
  4) npm run import:styles:update -- -i          # 上传并 styles.update 替换样图

用法:
  node scripts/import-style-templates.js [数据文件.md] [选项]

阶段（每次至少指定一个）:
  --placeholder-only        阶段1：上传占位图 + 创建 F01–F30 / M01–M30
  --generate-samples        阶段2：竖版样图（默认 1152×1536）→ generated/
  --generate-landscape      横版 4:3 样图（默认 1536×1152）→ generated-landscape/
  --update-samples-only     阶段3：上传生成图并更新 sampleFileId

通用选项:
  --interactive, -i         交互输入后台账号
  --dry-run                 仅解析 Markdown
  --skip-existing           跳过云库已有同编号/同性别同名
  --retry-failed            仅补录清单中失败的条目（配合 --placeholder-only）
  --placeholder PATH        占位图（默认 styles-import/placeholder.jpg）
  --work-dir PATH           工作目录（默认 backup/import-work/current）
  --manifest PATH           清单 JSON（默认 work-dir/import-manifest.json）
  --generated-dir PATH      生成样图目录（默认 work-dir/generated）
  --only F01,M01            仅处理部分编号
  --i2i-fallback            文生图未开通时，用即梦写真 i2i + 占位参考图生成样图
  --delay-ms N              每条间隔毫秒（默认 4000）
  --resolution W:H          文生图尺寸（默认 1152:1536）
  --check-login, -c

环境变量（阶段2文生图）:
  VOLC_ACCESS_KEY / VOLC_SECRET_KEY  （或 scripts/.env.backup）
  JIMENG_T2I_REQ_KEY=high_aes_general_v30   # 智能绘图通用3.0（默认）
  JIMENG_T2I_MODEL_VERSION=general_v3.0
  # 即梦4.0: JIMENG_T2I_REQ_KEY=jimeng_t2i_v40

`)
  printCredHelp()
}

async function post(api, body, token) {
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

function parseResolution(resolution) {
  const m = String(resolution || DEFAULT_RESOLUTION).match(/^(\d+):(\d+)$/)
  if (!m) throw new Error(`分辨率格式无效: ${resolution}`)
  return { width: Number(m[1]), height: Number(m[2]) }
}

function filterStyles(styles, onlyRaw) {
  if (!onlyRaw) return styles
  const set = new Set(
    onlyRaw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  )
  return styles.filter((s) => set.has(s.externalId))
}

function resolvePaths(opts) {
  const { root } = ensureStyleAssetsDirs()
  const sampleDir = path.join(root, 'styles-import')
  const workDir =
    opts.values.workDir ||
    path.join(__dirname, '..', 'backup', 'import-work', 'current')
  const manifestPath =
    opts.values.manifest || path.join(workDir, MANIFEST_NAME)
  const generatedDir = opts.flags.generateLandscape
    ? opts.values.generatedDir || path.join(workDir, 'generated-landscape')
    : opts.values.generatedDir || path.join(workDir, 'generated')

  fs.mkdirSync(workDir, { recursive: true })
  fs.mkdirSync(generatedDir, { recursive: true })
  fs.mkdirSync(sampleDir, { recursive: true })

  const placeholderPath =
    opts.values.placeholder || path.join(sampleDir, 'placeholder.jpg')

  return { sampleDir, workDir, manifestPath, generatedDir, placeholderPath }
}

function loadManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`找不到清单 ${manifestPath}，请先执行阶段1 --placeholder-only`)
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

function listFailedExternalIds(manifestPath) {
  if (!fs.existsSync(manifestPath)) return []
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  return (manifest.results || [])
    .filter((r) => r.status === 'failed')
    .map((r) => r.externalId)
    .filter(Boolean)
}

function mergePlaceholderManifest(manifestPath, patch) {
  const base = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {}
  const recordMap = new Map((base.records || []).map((r) => [r.externalId, r]))
  const resultMap = new Map((base.results || []).map((r) => [r.externalId, r]))

  ;(patch.records || []).forEach((r) => recordMap.set(r.externalId, r))
  ;(patch.results || []).forEach((r) => resultMap.set(r.externalId, r))

  return {
    ...base,
    ...patch,
    records: [...recordMap.values()].sort((a, b) =>
      String(a.externalId).localeCompare(String(b.externalId))
    ),
    results: [...resultMap.values()].sort((a, b) =>
      String(a.externalId).localeCompare(String(b.externalId))
    )
  }
}

function saveManifest(manifestPath, data) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function styleNameKey(name, gender) {
  const g = String(gender || '').trim() === '女' ? '女' : '男'
  return `${g}::${String(name || '').trim()}`
}

function ensureVolcEnv() {
  if (!process.env.VOLC_ACCESS_KEY || !process.env.VOLC_SECRET_KEY) {
    const fileVars = loadEnvFile(path.join(__dirname, '.env.backup'))
    if (fileVars.VOLC_ACCESS_KEY) process.env.VOLC_ACCESS_KEY = fileVars.VOLC_ACCESS_KEY
    if (fileVars.VOLC_SECRET_KEY) process.env.VOLC_SECRET_KEY = fileVars.VOLC_SECRET_KEY
    if (fileVars.JIMENG_T2I_REQ_KEY) process.env.JIMENG_T2I_REQ_KEY = fileVars.JIMENG_T2I_REQ_KEY
    if (fileVars.JIMENG_T2I_MODEL_VERSION) {
      process.env.JIMENG_T2I_MODEL_VERSION = fileVars.JIMENG_T2I_MODEL_VERSION
    }
  }
  if (!process.env.VOLC_ACCESS_KEY || !process.env.VOLC_SECRET_KEY) {
    throw new Error('文生图需要 VOLC_ACCESS_KEY / VOLC_SECRET_KEY（scripts/.env.backup）')
  }
}

function loadJimengT2I() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require('../cloudfunctions/jimengPortraitWorker/lib/jimeng.js')
}

function isT2iAccessDenied(err) {
  const body = err && err.response && err.response.data
  const text = [body && body.message, err && err.message].filter(Boolean).join(' ')
  return /access denied/i.test(text) || (body && body.code === 50400)
}

async function probeText2ImageAccess() {
  const { submitText2ImageTask } = loadJimengT2I()
  try {
    await submitText2ImageTask('连通性测试', { width: 1024, height: 1024 })
    return true
  } catch (err) {
    if (isT2iAccessDenied(err)) return false
    throw err
  }
}

async function generatePortraitWithRef(prompt, imageUrl, { width, height, maxWaitMs = 180000 }) {
  const { submitJimengTask, pollJimengTask, POLL_INTERVAL_MS } = loadJimengT2I()
  const taskId = await submitJimengTask(imageUrl, prompt, { width, height })
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const r = await pollJimengTask(taskId, {
      budgetMs: 20000,
      intervalMs: POLL_INTERVAL_MS,
      skipInitialDelay: true
    })
    if (r.status === 'done') return r.buffer
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error('即梦写真生成超时')
}

async function resolveReferenceImageUrl(opts, manifest, token) {
  if (manifest.placeholderSampleUrl && String(manifest.placeholderSampleUrl).startsWith('http')) {
    return manifest.placeholderSampleUrl
  }
  const res = await post(opts.api, { action: 'styles.list', page: 1, pageSize: 20 }, token)
  const placeholderId = manifest.placeholderFileId
  const row =
    (res.list || []).find((r) => r.sampleFileId === placeholderId) || (res.list || [])[0]
  const url = row && row.sampleUrl
  if (url && String(url).startsWith('http')) return url
  throw new Error('无法获取占位图 HTTPS 地址（styles.list 无 sampleUrl）')
}

function buildSampleGeneratePrompt(style, { landscape = false } = {}) {
  const safeOverrides = {
    F26:
      '中老年女性，温婉从容的气质，面带自然微笑。身着草绿色复古工装上衣，朴素无华，微微侧身站在乡村老建筑前，手轻扶木质独轮车。黄昏暖光斜照，田野与老式农具，怀旧氛围，空气感通透，保留真实自然的皮肤纹理。',
    M28:
      '中老年男性，沉稳从容的气质，面带自然微笑。身着藏青色中山装，庄重端正，微微侧身站在社区活动室，手轻放桌上书籍。室内灯光明亮，书架与木质桌椅，复古氛围，空气感通透，保留真实自然的皮肤纹理。'
  }
  const core = safeOverrides[style.externalId] || String(style.prompt || '').trim()
  if (landscape) {
    return `${core}，横版4比3宽幅场景效果图，环境氛围与服饰场景一致，构图开阔，无文字，无水印`
  }
  return `${core}，竖版单人写真效果参考图，构图居中，无文字，无水印`
}

async function uploadImageBase64(api, token, base64, mimeType = 'image/jpeg') {
  return post(api, { action: 'styles.uploadSample', base64, mimeType }, token)
}

async function loginSession(opts) {
  printCredentialHint(opts)
  const login = await post(
    opts.api,
    { action: 'login', username: opts.username, password: opts.password }
  )
  return login.token
}

async function fetchExistingMaps(api, token) {
  const res = await post(api, { action: 'styles.list', page: 1, pageSize: 100 }, token)
  const byNameGender = new Map()
  ;(res.list || []).forEach((r) => {
    byNameGender.set(styleNameKey(r.name, r.gender), r)
  })
  return {
    byNameGender,
    byId: new Map((res.list || []).map((r) => [String(r.id || '').toUpperCase(), r]))
  }
}

/** 阶段 1：占位图 + 批量 create */
async function runPlaceholderPhase(opts, styles, paths, token) {
  const { placeholderPath, manifestPath } = paths

  if (!fs.existsSync(placeholderPath)) {
    throw new Error(
      `请准备占位图: ${placeholderPath}\n（任意一张 JPG/PNG 即可，60 条风格将暂时共用）`
    )
  }

  console.log(`\n══ 阶段 1：占位入库 ══`)
  console.log(`占位图: ${placeholderPath}`)

  let placeholderFileId
  const priorManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null
  if (opts.flags.retryFailed && priorManifest && priorManifest.placeholderFileId) {
    placeholderFileId = priorManifest.placeholderFileId
    console.log(`复用占位 sampleFileId: ${placeholderFileId}`)
  } else {
    const mimeType = placeholderPath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    const placeholderBase64 = fs.readFileSync(placeholderPath).toString('base64')
    const placeholderUpload = await uploadImageBase64(opts.api, token, placeholderBase64, mimeType)
    placeholderFileId = placeholderUpload.sampleFileId
    console.log(`占位 sampleFileId: ${placeholderFileId}`)
  }

  const { byNameGender, byId } = await fetchExistingMaps(opts.api, token)
  const delayMs = Number(opts.values.delayMs) || 2000
  const records = []
  const results = []

  for (const style of styles) {
    const label = `${style.externalId} ${style.name}`
    try {
      if (opts.flags.skipExisting && byId.has(style.externalId)) {
        const row = byId.get(style.externalId)
        console.log(`⊘ 跳过 ${label}`)
        records.push({
          externalId: style.externalId,
          _id: row._id,
          id: row.id,
          name: row.name,
          status: 'skipped'
        })
        results.push({ externalId: style.externalId, status: 'skipped' })
        continue
      }
      if (opts.flags.skipExisting && byNameGender.has(styleNameKey(style.name, style.gender))) {
        const row = byNameGender.get(styleNameKey(style.name, style.gender))
        console.log(`⊘ 跳过（同性别同名）${label} → ${row.id}`)
        records.push({
          externalId: style.externalId,
          _id: row._id,
          id: row.id,
          name: row.name,
          status: 'skipped'
        })
        results.push({ externalId: style.externalId, status: 'skipped' })
        continue
      }

      console.log(`▶ 创建 ${label}`)
      const created = await post(
        opts.api,
        {
          action: 'styles.create',
          id: style.externalId,
          name: style.name,
          prompt: style.prompt,
          sampleFileId: placeholderFileId,
          gender: style.gender,
          sort: style.sort,
          resolution: opts.resolution,
          enabled: true
        },
        token
      )

      records.push({
        externalId: style.externalId,
        _id: created._id,
        id: created.id,
        name: created.name,
        gender: style.gender,
        prompt: style.prompt,
        status: 'created'
      })
      results.push({ externalId: style.externalId, status: 'created', id: created.id })
      byId.set(style.externalId, created)
      byNameGender.set(styleNameKey(created.name, created.gender), created)
      console.log(`  ✓ ${created.id}`)

      if (delayMs > 0) await sleep(delayMs)
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`)
      results.push({ externalId: style.externalId, status: 'failed', error: err.message })
    }
  }

  const manifest = mergePlaceholderManifest(manifestPath, {
    phase: 'placeholder',
    updatedAt: new Date().toISOString(),
    mdFile: opts.mdFile,
    resolution: opts.resolution,
    placeholderFileId,
    placeholderPath,
    records,
    results
  })
  saveManifest(manifestPath, manifest)

  const created = results.filter((r) => r.status === 'created').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length
  console.log(`\n阶段1完成: 新建 ${created} / 跳过 ${skipped} / 失败 ${failed}`)
  console.log(`清单: ${manifestPath}`)
  console.log('下一步: npm run import:styles:generate -- -i')
  return { created, skipped, failed }
}

/** 阶段 2：文生图 / i2i 样图（竖版或横版 4:3） */
async function runGenerateSamplesPhase(opts, styles, paths, token) {
  ensureVolcEnv()
  const { generateText2Image } = loadJimengT2I()
  const { generatedDir, manifestPath } = paths
  const manifest = loadManifest(manifestPath)
  const recordMap = new Map((manifest.records || []).map((r) => [r.externalId, r]))
  const isLandscape = !!opts.flags.generateLandscape

  const delayMs = Number(opts.values.delayMs) || 4000
  const { width, height } = parseResolution(opts.resolution)

  let useI2iFallback = !!opts.flags.i2iFallback || isLandscape
  if (!useI2iFallback) {
    const t2iOk = await probeText2ImageAccess()
    if (!t2iOk) {
      throw new Error(
        '即梦/智能绘图文生图未开通（Access Denied）。\n' +
          '控制台「智能绘图（文生图）」试用对应 high_aes_general_v30 + general_v3.0；\n' +
          '即梦 4.0 对应 jimeng_t2i_v40（需在 scripts/.env.backup 配置 JIMENG_T2I_REQ_KEY）。\n' +
          '或临时加 --i2i-fallback 用写真 i2i + 占位参考图生成样图。'
      )
    }
  }

  let referenceImageUrl = null
  if (useI2iFallback) {
    if (!token) throw new Error('--i2i-fallback 需要 adminApi 登录以获取占位图 URL')
    referenceImageUrl = await resolveReferenceImageUrl(opts, manifest, token)
    console.log(`参考图: ${referenceImageUrl.substring(0, 80)}...`)
  }

  const phaseTitle = isLandscape
    ? '横版 4:3 样图（1536×1152）'
    : useI2iFallback
      ? '写真 i2i 样图（占位参考图）'
      : '文生图样图（无参考图）'
  console.log(`\n══ 阶段 2：${phaseTitle} ══`)
  console.log(`输出: ${generatedDir}`)
  console.log(`尺寸: ${width}×${height}`)

  const generated = []
  const results = []

  for (const style of styles) {
    const label = `${style.externalId} ${style.name}`
    const outPath = path.join(generatedDir, `${style.externalId}.jpg`)
    try {
      if (fs.existsSync(outPath) && opts.flags.skipExisting) {
        console.log(`⊘ 已有样图 ${style.externalId}`)
        generated.push({
          externalId: style.externalId,
          localPath: outPath,
          status: 'skipped'
        })
        results.push({ externalId: style.externalId, status: 'skipped' })
        continue
      }

      const rec = recordMap.get(style.externalId)
      if (!rec || !rec._id) {
        throw new Error('清单中无此风格记录，请先执行阶段1')
      }

      console.log(`\n▶ 生成 ${label}`)
      const prompt = buildSampleGeneratePrompt(style, { landscape: isLandscape })
      const rawBuf = useI2iFallback
        ? await generatePortraitWithRef(prompt, referenceImageUrl, {
            width,
            height,
            maxWaitMs: 180000
          })
        : await generateText2Image(prompt, { width, height, maxWaitMs: 180000 })
      const rawPath = path.join(generatedDir, `${style.externalId}-raw.jpg`)
      fs.writeFileSync(rawPath, rawBuf)
      if (isLandscape) {
        cropLandscape43ToJpeg(rawPath, outPath)
      } else {
        cropSampleToJpeg(rawPath, outPath)
      }
      console.log(`  ✓ ${outPath}`)

      generated.push({
        externalId: style.externalId,
        _id: rec._id,
        localPath: outPath,
        status: 'generated'
      })
      results.push({ externalId: style.externalId, status: 'generated', localPath: outPath })

      if (delayMs > 0) await sleep(delayMs)
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`)
      results.push({ externalId: style.externalId, status: 'failed', error: err.message })
    }
  }

  if (isLandscape) {
    manifest.landscapePhase = 'generated'
    manifest.landscapeGeneratedDir = generatedDir
    manifest.landscapeGenerated = generated
    manifest.landscapeGenerateResults = results
  } else {
    manifest.phase = 'generated'
    manifest.generatedDir = generatedDir
    manifest.generated = generated
    manifest.generateResults = results
  }
  manifest.updatedAt = new Date().toISOString()
  saveManifest(manifestPath, manifest)

  const ok = results.filter((r) => r.status === 'generated').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length
  console.log(`\n阶段2完成: 生成 ${ok} / 跳过 ${skipped} / 失败 ${failed}`)
  console.log(`清单: ${manifestPath}`)
  if (!isLandscape) console.log('下一步: npm run import:styles:update -- -i')
  return { ok, skipped, failed }
}

/** 阶段 3：上传生成图 + styles.update */
async function runUpdateSamplesPhase(opts, styles, paths, token) {
  const { generatedDir, manifestPath } = paths
  const manifest = loadManifest(manifestPath)
  const recordMap = new Map((manifest.records || []).map((r) => [r.externalId, r]))
  const delayMs = Number(opts.values.delayMs) || 2000

  console.log(`\n══ 阶段 3：替换样图 ══`)

  const results = []

  for (const style of styles) {
    const label = `${style.externalId} ${style.name}`
    try {
      const rec = recordMap.get(style.externalId)
      if (!rec || !rec._id) {
        throw new Error('清单中无 _id，请先执行阶段1')
      }

      let localPath = path.join(generatedDir, `${style.externalId}.jpg`)
      if (!fs.existsSync(localPath)) {
        localPath = findSampleRawPath(generatedDir, style.externalId)
      }
      if (!localPath || !fs.existsSync(localPath)) {
        throw new Error(`找不到样图 ${generatedDir}/${style.externalId}.jpg`)
      }

      console.log(`▶ 更新 ${label}`)
      const base64 = readJpegBase64(localPath)
      const upload = await uploadImageBase64(opts.api, token, base64, 'image/jpeg')
      await post(
        opts.api,
        {
          action: 'styles.update',
          _id: rec._id,
          sampleFileId: upload.sampleFileId
        },
        token
      )
      console.log(`  ✓ ${upload.sampleFileId}`)

      results.push({
        externalId: style.externalId,
        _id: rec._id,
        sampleFileId: upload.sampleFileId,
        localPath,
        localMtimeMs: fs.statSync(localPath).mtimeMs,
        status: 'updated'
      })

      if (delayMs > 0) await sleep(delayMs)
    } catch (err) {
      console.error(`  ✗ ${label}: ${err.message}`)
      results.push({ externalId: style.externalId, status: 'failed', error: err.message })
    }
  }

  manifest.phase = 'updated'
  manifest.updatedAt = new Date().toISOString()
  manifest.updateResults = results
  saveManifest(manifestPath, manifest)

  const ok = results.filter((r) => r.status === 'updated').length
  const failed = results.filter((r) => r.status === 'failed').length
  console.log(`\n阶段3完成: 更新 ${ok} / 失败 ${failed}`)
  console.log(`清单: ${manifestPath}`)
  return { ok, failed }
}

async function main() {
  let opts = parseImportArgs(process.argv.slice(2))

  if (opts.flags.help) {
    printImportHelp()
    return
  }

  opts = await maybePromptCredentials(opts)

  if (opts.flags.checkLogin) {
    printCredentialHint(opts)
    await post(opts.api, { action: 'login', username: opts.username, password: opts.password })
    console.log('\n✓ 登录成功')
    return
  }

  let styles = filterStyles(parseStylePromptsMarkdownFile(opts.mdFile), opts.values.only)
  const pathsEarly = resolvePaths(opts)

  if (opts.flags.retryFailed) {
    const failedIds = listFailedExternalIds(pathsEarly.manifestPath)
    if (!failedIds.length) {
      console.log('清单中无失败项，无需补录')
      return
    }
    styles = styles.filter((s) => failedIds.includes(s.externalId))
    console.log(`补录 ${styles.length} 条: ${failedIds.join(', ')}`)
    console.log('提示: 须先重新部署 adminApi（同名按性别校验），否则仍会失败')
  }

  console.log(`数据文件: ${opts.mdFile}`)
  console.log(`解析 ${styles.length} 条（女 ${styles.filter((s) => s.gender === '女').length} / 男 ${styles.filter((s) => s.gender === '男').length}）`)

  if (opts.flags.dryRun) {
    styles.forEach((s) => console.log(`  ${s.externalId} [${s.gender}] ${s.name}`))
    console.log('\n(dry-run)')
    return
  }

  const phaseFlags = [
    opts.flags.placeholderOnly,
    opts.flags.generateSamples,
    opts.flags.generateLandscape,
    opts.flags.updateSamplesOnly
  ].filter(Boolean)

  if (!phaseFlags.length) {
    printImportHelp()
    throw new Error(
      '请指定阶段: --placeholder-only | --generate-samples | --generate-landscape | --update-samples-only'
    )
  }
  if (phaseFlags.length > 1) {
    throw new Error('每次只运行一个阶段（分三条 npm 命令执行）')
  }

  const paths = resolvePaths(opts)
  console.log(`工作目录: ${paths.workDir}`)

  let token = null
  if (
    opts.flags.placeholderOnly ||
    opts.flags.updateSamplesOnly ||
    opts.flags.i2iFallback ||
    opts.flags.generateLandscape
  ) {
    token = await loginSession(opts)
  }

  let exitCode = 0
  if (opts.flags.placeholderOnly) {
    const s = await runPlaceholderPhase(opts, styles, paths, token)
    if (s.failed > 0) exitCode = 1
  } else if (opts.flags.generateSamples || opts.flags.generateLandscape) {
    const s = await runGenerateSamplesPhase(opts, styles, paths, token)
    if (s.failed > 0) exitCode = 1
  } else if (opts.flags.updateSamplesOnly) {
    const s = await runUpdateSamplesPhase(opts, styles, paths, token)
    if (s.failed > 0) exitCode = 1
  }

  if (exitCode) process.exit(exitCode)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
