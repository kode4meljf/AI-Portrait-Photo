#!/usr/bin/env node
/**
 * 火山方舟 Seedream 并发 submit 探测（不走 Worker / 不扣费业务逻辑）
 *
 * 用法：
 *   ARK_API_KEY=ark-xxx node scripts/bench-ark-seedream-concurrency.js
 *   ARK_API_KEY=ark-xxx node scripts/bench-ark-seedream-concurrency.js --max 30 --step 5
 *   ARK_API_KEY=ark-xxx node scripts/bench-ark-seedream-concurrency.js --levels 1,2,3,5,10,15,20,30
 *
 * 可选参数：
 *   --max <n>           最大并发（默认 30）
 *   --step <n>          递增步长（默认 5），与 --levels 二选一
 *   --levels 1,2,5,10   指定各档并发数
 *   --rounds <n>        每档重复轮数（默认 1）
 *   --model <id>        默认见 portraitEngineConfig，可选 4.5 / 5.0 模型 ID
 *   --size <WxH>        默认 1728x2304（2K 竖图，较快）
 *   --cooldown-ms <n>   每档之间冷却（默认 3000）
 *   --timeout-ms <n>    单请求超时（默认 120000）
 */
const { DEFAULT_SEEDREAM_MODEL_ID } = require('../cloudfunctions/lib/portraitEngineConfig')

const ARK_IMAGES_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const DEFAULT_MODEL = DEFAULT_SEEDREAM_MODEL_ID
const DEFAULT_IMAGE =
  'https://ark-project.tos-cn-beijing.volces.com/doc_image/seedream4_imageToimage.png'
const DEFAULT_PROMPT =
  'professional portrait photo, studio soft lighting, natural skin texture, high quality'

function parseArgs(argv) {
  const opts = {
    max: 30,
    step: 5,
    levels: null,
    rounds: 1,
    model: DEFAULT_MODEL,
    size: '1728x2304',
    cooldownMs: 3000,
    timeoutMs: 120000
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--max') opts.max = Math.max(1, Number(argv[++i]) || 30)
    else if (arg === '--step') opts.step = Math.max(1, Number(argv[++i]) || 5)
    else if (arg === '--levels') {
      opts.levels = String(argv[++i] || '')
        .split(',')
        .map((s) => Math.max(1, Math.floor(Number(s.trim()))))
        .filter((n) => Number.isFinite(n) && n > 0)
    } else if (arg === '--rounds') opts.rounds = Math.max(1, Number(argv[++i]) || 1)
    else if (arg === '--model') opts.model = String(argv[++i] || '').trim()
    else if (arg === '--size') opts.size = String(argv[++i] || '').trim()
    else if (arg === '--cooldown-ms') opts.cooldownMs = Math.max(0, Number(argv[++i]) || 0)
    else if (arg === '--timeout-ms') opts.timeoutMs = Math.max(10000, Number(argv[++i]) || 120000)
    else if (arg === '--help' || arg === '-h') opts.help = true
  }
  return opts
}

function buildLevels(opts) {
  if (opts.levels && opts.levels.length) {
    return [...new Set(opts.levels)].sort((a, b) => a - b)
  }
  const levels = []
  for (let n = opts.step; n <= opts.max; n += opts.step) levels.push(n)
  if (levels[levels.length - 1] !== opts.max) levels.push(opts.max)
  return [...new Set(levels)].sort((a, b) => a - b)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function classifyError(status, bodyText) {
  const text = String(bodyText || '')
  if (status === 429) return '429-rate-limit'
  if (status >= 500) return `${status}-server`
  if (status === 403) return '403-forbidden'
  if (status === 401) return '401-auth'
  if (/rate limit|too many|throttl|并发|AccountRateLimit/i.test(text)) return 'rate-limit-body'
  if (status >= 400) return `${status}-client`
  return 'other'
}

async function generateOnce(apiKey, ctx, slot) {
  const started = Date.now()
  const payload = {
    model: ctx.model,
    prompt: ctx.prompt,
    image: ctx.image,
    size: ctx.size,
    sequential_image_generation: 'disabled',
    response_format: 'url',
    stream: false,
    watermark: false
  }
  try {
    const res = await fetch(ARK_IMAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(ctx.timeoutMs)
    })
    const text = await res.text()
    const elapsed = Date.now() - started
    if (!res.ok) {
      return {
        slot,
        ok: false,
        elapsed,
        status: res.status,
        kind: classifyError(res.status, text),
        detail: text.slice(0, 240)
      }
    }
    let body
    try {
      body = JSON.parse(text)
    } catch {
      return {
        slot,
        ok: false,
        elapsed,
        status: res.status,
        kind: 'bad-json',
        detail: text.slice(0, 240)
      }
    }
    const url = body.data && body.data[0] && body.data[0].url
    if (!url) {
      return {
        slot,
        ok: false,
        elapsed,
        status: res.status,
        kind: 'no-url',
        detail: text.slice(0, 240)
      }
    }
    return { slot, ok: true, elapsed, status: res.status, kind: 'ok' }
  } catch (err) {
    const elapsed = Date.now() - started
    const msg = String(err.message || err)
    let kind = 'network'
    if (/timeout|aborted|AbortError/i.test(msg)) kind = 'timeout'
    return { slot, ok: false, elapsed, status: 0, kind, detail: msg.slice(0, 240) }
  }
}

async function runLevel(apiKey, ctx, concurrency, roundIndex) {
  const wallStart = Date.now()
  const tasks = []
  for (let i = 0; i < concurrency; i += 1) {
    tasks.push(generateOnce(apiKey, ctx, i + 1))
  }
  const results = await Promise.all(tasks)
  const wallMs = Date.now() - wallStart
  const ok = results.filter((r) => r.ok)
  const fail = results.filter((r) => !r.ok)
  const byKind = {}
  for (const r of fail) {
    byKind[r.kind] = (byKind[r.kind] || 0) + 1
  }
  const latencies = ok.map((r) => r.elapsed).sort((a, b) => a - b)
  const avgMs = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0
  const p50Ms = latencies.length ? latencies[Math.floor(latencies.length / 2)] : 0
  return {
    concurrency,
    roundIndex,
    wallMs,
    success: ok.length,
    failed: fail.length,
    byKind,
    avgMs,
    p50Ms,
    minMs: latencies[0] || 0,
    maxMs: latencies[latencies.length - 1] || 0,
    samples: results
  }
}

function printLevelSummary(row) {
  const ratePart =
    row.failed > 0
      ? ` · 失败 ${row.failed} (${Object.entries(row.byKind)
          .map(([k, v]) => `${k}:${v}`)
          .join(', ')})`
      : ''
  console.log(
    `  并发 ${String(row.concurrency).padStart(2)} · 成功 ${row.success}/${row.concurrency}` +
      ratePart +
      ` · wall ${row.wallMs}ms · 成功耗时 avg ${row.avgMs}ms p50 ${row.p50Ms}ms` +
      (row.success ? ` (${row.minMs}-${row.maxMs}ms)` : '')
  )
  if (row.failed > 0) {
    const firstFail = row.samples.find((s) => !s.ok)
    if (firstFail) {
      console.log(
        `    样例失败: slot=${firstFail.slot} status=${firstFail.status} kind=${firstFail.kind}`
      )
      if (firstFail.detail) console.log(`    ${firstFail.detail}`)
    }
  }
}

function printHelp() {
  console.log(`用法: ARK_API_KEY=ark-xxx node scripts/bench-ark-seedream-concurrency.js

默认探测档位: 5,10,15,20,25,30（--max 30 --step 5）
或: --levels 1,2,3,5,10,15,20,30
`)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    return
  }

  const apiKey = String(process.env.ARK_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('缺少 ARK_API_KEY 环境变量')
  }

  const levels = buildLevels(opts)
  const ctx = {
    model: opts.model,
    prompt: DEFAULT_PROMPT,
    image: DEFAULT_IMAGE,
    size: opts.size,
    timeoutMs: opts.timeoutMs
  }

  console.log('方舟 Seedream 并发 submit 探测')
  console.log(`  endpoint: ${ARK_IMAGES_URL}`)
  console.log(`  model: ${ctx.model}`)
  console.log(`  size: ${ctx.size}`)
  console.log(`  档位: ${levels.join(', ')}`)
  console.log(`  每档 rounds: ${opts.rounds}`)
  console.log(`  单请求 timeout: ${opts.timeoutMs}ms`)
  console.log('')

  const allRows = []
  let firstFailureLevel = null

  for (const concurrency of levels) {
    console.log(`\n=== 并发 ${concurrency} ===`)
    for (let round = 1; round <= opts.rounds; round += 1) {
      const row = await runLevel(apiKey, ctx, concurrency, round)
      allRows.push(row)
      if (opts.rounds > 1) process.stdout.write(`  [round ${round}/${opts.rounds}] `)
      else process.stdout.write(' ')
      printLevelSummary(row)
      if (row.failed > 0 && firstFailureLevel == null) {
        firstFailureLevel = concurrency
      }
    }
    if (opts.cooldownMs > 0) await sleep(opts.cooldownMs)
  }

  console.log('\n======== 汇总 ========')
  for (const row of allRows) {
    const flag = row.failed === 0 ? 'OK' : 'FAIL'
    console.log(
      `[${flag}] 并发 ${row.concurrency}` +
        (opts.rounds > 1 ? ` r${row.roundIndex}` : '') +
        `: ${row.success}/${row.concurrency} 成功, wall ${row.wallMs}ms`
    )
  }

  const maxFullSuccess = allRows.reduce(
    (best, row) => (row.failed === 0 && row.concurrency > best ? row.concurrency : best),
    0
  )
  console.log('')
  if (maxFullSuccess > 0) {
    console.log(`本账号本次测试：并发 ${maxFullSuccess} 仍全部成功。`)
  }
  if (firstFailureLevel != null) {
    console.log(`首次出现失败：并发 ${firstFailureLevel}。`)
    console.log('建议生产 Worker 最大并发设为低于该值的稳定档位（并留 429 重试）。')
  } else {
    console.log(`并发 ${levels[levels.length - 1]} 全部成功；更高档位未测或需加大 --max。`)
  }
}

main().catch((err) => {
  console.error('[bench:ark-seedream-concurrency] 失败:', err.message || err)
  process.exit(1)
})
