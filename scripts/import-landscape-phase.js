/**
 * 横版 4:3 样图生成（1536×1152），在竖图管线完成后执行
 */
const fs = require('fs')
const path = require('path')
const { spawn, execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const WORK_DIR = path.join(ROOT, 'backup', 'import-work', 'current')
const VERTICAL_DIR = path.join(WORK_DIR, 'generated')
const LANDSCAPE_DIR = path.join(WORK_DIR, 'generated-landscape')
const MANIFEST_PATH = path.join(WORK_DIR, 'import-manifest.json')
const PENDING_PATH = path.join(WORK_DIR, 'pending-tasks.json')

const ALL_IDS = [
  ...Array.from({ length: 30 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 30 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`)
]

const MIN_LANDSCAPE_BYTES = 40_000
const MAX_RETRIES = 5
const POLL_MS = 60_000

function landscapePath(id) {
  return path.join(LANDSCAPE_DIR, `${id}.jpg`)
}

function hasValidLandscape(id) {
  const p = landscapePath(id)
  if (!fs.existsSync(p)) return false
  try {
    return fs.statSync(p).size >= MIN_LANDSCAPE_BYTES
  } catch {
    return false
  }
}

function listMissingLandscape() {
  return ALL_IDS.filter((id) => !hasValidLandscape(id))
}

function listReadyLandscape() {
  return ALL_IDS.filter((id) => hasValidLandscape(id))
}

function hasValidVertical(id) {
  const p = path.join(VERTICAL_DIR, `${id}.jpg`)
  if (!fs.existsSync(p)) return false
  try {
    return fs.statSync(p).size >= 8_000
  } catch {
    return false
  }
}

function isVerticalPipelineComplete() {
  const ready = ALL_IDS.filter((id) => hasValidVertical(id)).length
  if (ready < 60) return false
  if (!fs.existsSync(MANIFEST_PATH)) return false
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const updated = (manifest.updateResults || []).filter((r) => r.status === 'updated').length
  return updated >= 60
}

function isImportChildRunning() {
  try {
    const out = execSync('ps aux | grep "import-style-templates.js" | grep -v grep || true', {
      encoding: 'utf8'
    })
    return out.split('\n').some((line) => line.includes('import-style-templates.js'))
  } catch {
    return false
  }
}

function runGenerateLandscape(onlyIds, log = console.log) {
  return new Promise((resolve, reject) => {
    const only = onlyIds.join(',')
    log(`横图生成: ${onlyIds.length} 条 (${only.slice(0, 40)}${only.length > 40 ? '…' : ''})`)
    const args = [
      '--generate-landscape',
      '--i2i-fallback',
      '--skip-existing',
      '--delay-ms',
      '8000',
      '--resolution',
      '1536:1152',
      '--only',
      only
    ]
    const child = spawn('node', ['scripts/import-style-templates.js', ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, JIMENG_MIN_INTERVAL_MS: '1500' }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`横图生成退出码 ${code}`))
    })
  })
}

async function waitImportIdle(log = console.log) {
  let n = 0
  while (isImportChildRunning()) {
    if (n % 6 === 0) log('等待 import 任务空闲…')
    await new Promise((r) => setTimeout(r, 10_000))
    n += 1
  }
}

async function retryLandscapeGenerateUntilDone(log = console.log) {
  fs.mkdirSync(LANDSCAPE_DIR, { recursive: true })
  const retryCount = new Map()

  while (true) {
    const missing = listMissingLandscape()
    if (!missing.length) {
      log(`横图齐全: ${listReadyLandscape().length}/60 → ${LANDSCAPE_DIR}`)
      return { ok: true, count: 60 }
    }

    log(`横图缺少 ${missing.length} 条`)

    if (isImportChildRunning()) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }

    for (const id of missing) {
      const n = retryCount.get(id) || 0
      if (n >= MAX_RETRIES) continue

      await waitImportIdle(log)
      try {
        await runGenerateLandscape([id], log)
        if (hasValidLandscape(id)) {
          retryCount.delete(id)
        } else {
          retryCount.set(id, n + 1)
        }
      } catch (err) {
        retryCount.set(id, n + 1)
        log(`横图失败 ${id} (${n + 1}/${MAX_RETRIES}): ${err.message}`)
      }
      await new Promise((r) => setTimeout(r, 5_000))
    }

    const exhausted = missing.filter((id) => (retryCount.get(id) || 0) >= MAX_RETRIES)
    if (exhausted.length && listMissingLandscape().length === exhausted.length) {
      throw new Error(`横图生成失败已达上限: ${exhausted.join(', ')}`)
    }

    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

function writePendingTask() {
  const task = {
    landscape: {
      enabled: true,
      resolution: '1536:1152',
      aspect: '4:3',
      outputDir: 'generated-landscape',
      queuedAt: new Date().toISOString()
    }
  }
  fs.mkdirSync(WORK_DIR, { recursive: true })
  fs.writeFileSync(PENDING_PATH, `${JSON.stringify(task, null, 2)}\n`, 'utf8')
}

module.exports = {
  WORK_DIR,
  LANDSCAPE_DIR,
  PENDING_PATH,
  ALL_IDS,
  landscapePath,
  hasValidLandscape,
  listMissingLandscape,
  listReadyLandscape,
  isVerticalPipelineComplete,
  retryLandscapeGenerateUntilDone,
  writePendingTask
}
