#!/usr/bin/env node
/**
 * 全自动：监控样图生成 → 失败重试 → 阶段3上传更新 → 云库校验
 *
 * 用法：npm run import:styles:watch
 */
const fs = require('fs')
const path = require('path')
const { spawn, execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const WORK_DIR = path.join(ROOT, 'backup', 'import-work', 'current')
const GENERATED_DIR = path.join(WORK_DIR, 'generated')
const MANIFEST_PATH = path.join(WORK_DIR, 'import-manifest.json')
const LOG_PATH = path.join(WORK_DIR, 'orchestrator.log')
const LOCK_PATH = path.join(WORK_DIR, '.orchestrator.lock')

const ALL_IDS = [
  ...Array.from({ length: 30 }, (_, i) => `F${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 30 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`)
]

const {
  retryLandscapeGenerateUntilDone,
  listReadyLandscape,
  LANDSCAPE_DIR
} = require('./import-landscape-phase')

const POLL_MS = 60_000
const MAX_GENERATE_RETRIES = 5
const MIN_JPEG_BYTES = 8_000

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function isImportChildRunning() {
  try {
    const out = execSync('ps aux | grep "import-style-templates.js" | grep -v grep || true', {
      encoding: 'utf8'
    })
    return out
      .split('\n')
      .some((line) => line.includes('import-style-templates.js') && !line.includes('import-orchestrator'))
  } catch {
    return false
  }
}

function samplePath(id) {
  return path.join(GENERATED_DIR, `${id}.jpg`)
}

function hasValidSample(id) {
  const p = samplePath(id)
  if (!fs.existsSync(p)) return false
  try {
    return fs.statSync(p).size >= MIN_JPEG_BYTES
  } catch {
    return false
  }
}

function listMissing() {
  return ALL_IDS.filter((id) => !hasValidSample(id))
}

function listReady() {
  return ALL_IDS.filter((id) => hasValidSample(id))
}

function runNpm(args, label) {
  return new Promise((resolve, reject) => {
    log(`启动: ${label} → node scripts/import-style-templates.js ${args.join(' ')}`)
    const child = spawn('node', ['scripts/import-style-templates.js', ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, JIMENG_MIN_INTERVAL_MS: '1500' }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${label} 退出码 ${code}`))
    })
  })
}

async function waitForImportIdle(label) {
  let waits = 0
  while (isImportChildRunning()) {
    if (waits % 5 === 0) log(`等待进行中的 import 任务结束… (${label})`)
    await sleep(10_000)
    waits += 1
  }
}

async function generateIds(ids) {
  if (!ids.length) return
  await waitForImportIdle('generate')
  const only = ids.join(',')
  await runNpm(
    [
      '--generate-samples',
      '--i2i-fallback',
      '--skip-existing',
      '--delay-ms',
      '8000',
      '--only',
      only
    ],
    `generate ${ids.length} 条`
  )
}

async function updateIds(ids) {
  if (!ids.length) return
  await waitForImportIdle('update')
  const only = ids.join(',')
  await runNpm(['--update-samples-only', '--only', only], `update ${ids.length} 条`)
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return {}
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
}

function idsNeedingUpdate(manifest, cloudById) {
  const placeholderId = manifest.placeholderFileId || ''
  const updatedMap = new Map(
    (manifest.updateResults || [])
      .filter((r) => r.status === 'updated')
      .map((r) => [r.externalId, r])
  )

  return listReady().filter((id) => {
    if (!hasValidSample(id)) return false
    const row = cloudById.get(id)
    if (!row) return true
    if (placeholderId && row.sampleFileId === placeholderId) return true
    const prev = updatedMap.get(id)
    if (!prev) return true
    const jpgMtime = fs.statSync(samplePath(id)).mtimeMs
    const prevMtime = prev.localMtimeMs || 0
    return jpgMtime > prevMtime + 1000
  })
}

async function fetchCloudStyles() {
  const { loadEnvFile } = require('./adminApiCredentials')
  const fileVars = loadEnvFile(path.join(__dirname, '.env.backup'))
  const api = fileVars.ADMIN_API_URL
  const username = fileVars.ADMIN_USERNAME
  const password = fileVars.ADMIN_PASSWORD

  const post = async (body, token) => {
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

  const login = await post({ action: 'login', username, password })
  const list = await post({ action: 'styles.list', page: 1, pageSize: 100 }, login.token)
  const byId = new Map((list.list || []).map((r) => [r.id, r]))
  return { byId, total: list.total }
}

async function verifyCloud(manifest) {
  const { byId, total } = await fetchCloudStyles()
  const placeholderId = manifest.placeholderFileId || ''
  const problems = []

  if (total < 60) problems.push(`云库仅 ${total} 条，期望 60`)

  for (const id of ALL_IDS) {
    const row = byId.get(id)
    if (!row) {
      problems.push(`${id} 不在云库`)
      continue
    }
    if (!row.sampleFileId) {
      problems.push(`${id} 无 sampleFileId`)
    } else if (placeholderId && row.sampleFileId === placeholderId) {
      problems.push(`${id} 仍为占位样图`)
    }
    if (!row.prompt || !String(row.prompt).trim()) {
      problems.push(`${id} 无 prompt`)
    }
    if (row.enabled === false) {
      problems.push(`${id} 未启用`)
    }
  }

  return { ok: problems.length === 0, problems, total }
}

async function retryGenerateUntilDone() {
  const retryCount = new Map()

  while (true) {
    const missing = listMissing()
    if (!missing.length) {
      log(`样图齐全: ${listReady().length}/60`)
      return
    }

    log(`缺少样图 ${missing.length} 条: ${missing.join(', ')}`)

    if (isImportChildRunning()) {
      log('已有 generate 任务运行，等待…')
      await sleep(POLL_MS)
      continue
    }

    const batch = []
    for (const id of missing) {
      const n = retryCount.get(id) || 0
      if (n >= MAX_GENERATE_RETRIES) continue
      batch.push(id)
    }

    const exhausted = missing.filter((id) => (retryCount.get(id) || 0) >= MAX_GENERATE_RETRIES)
    if (exhausted.length && !batch.length) {
      throw new Error(`以下条目生成失败已达 ${MAX_GENERATE_RETRIES} 次: ${exhausted.join(', ')}`)
    }

    for (const id of batch) {
      try {
        await generateIds([id])
        if (hasValidSample(id)) {
          retryCount.delete(id)
        } else {
          retryCount.set(id, (retryCount.get(id) || 0) + 1)
          log(`重试计数 ${id}: ${retryCount.get(id)}`)
        }
      } catch (err) {
        retryCount.set(id, (retryCount.get(id) || 0) + 1)
        log(`生成失败 ${id}: ${err.message}`)
      }
      await sleep(5_000)
    }

    await sleep(POLL_MS)
  }
}

async function runUpdatePhase() {
  const manifest = loadManifest()

  while (true) {
    const { byId } = await fetchCloudStyles()
    const todo = idsNeedingUpdate(manifest, byId)
    if (!todo.length) {
      log('所有已生成样图均已上传更新')
      return
    }

    log(`待上传更新 ${todo.length} 条: ${todo.slice(0, 10).join(', ')}${todo.length > 10 ? '…' : ''}`)

    if (isImportChildRunning()) {
      await sleep(10_000)
      continue
    }

    const batch = todo.slice(0, 10)
    try {
      await updateIds(batch)
    } catch (err) {
      log(`更新批次失败: ${err.message}，60s 后重试`)
      await sleep(60_000)
    }

    await sleep(5_000)
  }
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true })
  fs.mkdirSync(GENERATED_DIR, { recursive: true })

  if (fs.existsSync(LOCK_PATH)) {
    const pid = fs.readFileSync(LOCK_PATH, 'utf8').trim()
    try {
      process.kill(Number(pid), 0)
      log(`编排器已在运行 (pid ${pid})，退出`)
      process.exit(0)
    } catch {
      fs.unlinkSync(LOCK_PATH)
    }
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid), 'utf8')

  const cleanup = () => {
    try {
      fs.unlinkSync(LOCK_PATH)
    } catch {
      /* ignore */
    }
  }
  process.on('exit', cleanup)
  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })

  log('══ 导入编排器启动 ══')
  log(`目标: 60 条风格样图生成并上传，截止明日 06:00`)

  const deadline = new Date()
  deadline.setDate(deadline.getDate() + (deadline.getHours() >= 6 ? 1 : 0))
  deadline.setHours(6, 0, 0, 0)
  if (deadline.getTime() <= Date.now()) deadline.setDate(deadline.getDate() + 1)
  log(`截止时间: ${deadline.toISOString()}`)

  try {
    log(`当前进度: 样图 ${listReady().length}/60`)

    await waitForImportIdle('initial-batch')
    await retryGenerateUntilDone()

    log('阶段2完成，开始阶段3上传更新')
    await runUpdatePhase()

    let manifest = loadManifest()
    let check = await verifyCloud(manifest)
    let rounds = 0
    while (!check.ok && rounds < 3) {
      log(`云库校验未通过 (${check.problems.length} 项)，尝试修复…`)
      check.problems.slice(0, 15).forEach((p) => log(`  • ${p}`))

      const placeholderIds = ALL_IDS.filter((id) => {
        const row = check.problems.some((p) => p.startsWith(`${id} 仍为占位`))
        return row
      })
      if (placeholderIds.length && hasValidSample(placeholderIds[0])) {
        await updateIds(placeholderIds.filter((id) => hasValidSample(id)))
      }

      const missingSamples = listMissing()
      if (missingSamples.length) await retryGenerateUntilDone()

      await runUpdatePhase()
      manifest = loadManifest()
      check = await verifyCloud(manifest)
      rounds += 1
    }

    if (check.ok) {
      log('══ 竖图管线完成：60 条风格已入库且样图已替换，可正常使用 ══')
      log(`云库共 ${check.total} 条`)

      log('══ 开始后续任务：横版 4:3 样图 1536×1152（60 张）══')
      await retryLandscapeGenerateUntilDone(log)
      log(`══ 横图任务完成: ${listReadyLandscape().length}/60 → ${LANDSCAPE_DIR} ══`)
    } else {
      log('══ 完成但有遗留问题 ══')
      check.problems.forEach((p) => log(`  • ${p}`))
      process.exit(1)
    }
  } catch (err) {
    log(`编排器异常: ${err.message}`)
    process.exit(1)
  } finally {
    cleanup()
  }
}

main()
