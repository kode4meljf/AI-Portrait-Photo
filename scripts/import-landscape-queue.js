#!/usr/bin/env node
/**
 * 等待竖图管线（60 条上传完成）后，自动生成 60 张横版 4:3 图（1536×1152）
 *
 * 用法：npm run import:styles:watch-landscape
 */
const fs = require('fs')
const path = require('path')
const {
  WORK_DIR,
  PENDING_PATH,
  isVerticalPipelineComplete,
  retryLandscapeGenerateUntilDone,
  listReadyLandscape,
  writePendingTask
} = require('./import-landscape-phase')

const LOG_PATH = path.join(WORK_DIR, 'landscape-queue.log')
const LOCK_PATH = path.join(WORK_DIR, '.landscape-queue.lock')

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  fs.mkdirSync(WORK_DIR, { recursive: true })
  fs.appendFileSync(LOG_PATH, `${line}\n`, 'utf8')
}

async function main() {
  if (fs.existsSync(LOCK_PATH)) {
    const pid = fs.readFileSync(LOCK_PATH, 'utf8').trim()
    try {
      process.kill(Number(pid), 0)
      log(`横图队列已在运行 (pid ${pid})`)
      return
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

  writePendingTask()
  log('══ 横图任务已排队（竖图管线完成后自动开始）══')
  log('规格: 4:3 横图 1536×1152，输出 generated-landscape/')

  while (!isVerticalPipelineComplete()) {
    log('等待竖图管线完成（60 张竖图 + 云库上传）…')
    await new Promise((r) => setTimeout(r, 120_000))
  }

  log('竖图管线已完成，开始横图生成')
  await retryLandscapeGenerateUntilDone(log)
  log(`══ 横图 60 张全部完成: ${listReadyLandscape().length}/60 ══`)

  if (fs.existsSync(PENDING_PATH)) {
    const pending = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8'))
    pending.landscape.completedAt = new Date().toISOString()
    pending.landscape.status = 'done'
    fs.writeFileSync(PENDING_PATH, `${JSON.stringify(pending, null, 2)}\n`, 'utf8')
  }

  cleanup()
}

main().catch((err) => {
  log(`横图队列异常: ${err.message}`)
  process.exit(1)
})
