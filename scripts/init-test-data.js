#!/usr/bin/env node
/**
 * scripts/init-test-data.js
 *
 * 向 AI-Portrait-Miniprogram 的云数据库写入 10 条客户测试数据。
 *
 * 使用方式：
 *   node scripts/init-test-data.js
 *
 * 依赖环境变量（可新建 .env 文件或提前 export）：
 *   TENCENT_SECRET_ID=你的 SecretId
 *   TENCENT_SECRET_KEY=你的 SecretKey
 *   TCB_ENV_ID=你的云开发环境 ID（在微信公众平台 -> 开发管理 -> 开发环境 ID）
 *
 * 也支持直接传入参数：
 *   node scripts/init-test-data.js --secretId=xxx --secretKey=yyy --envId=zzz
 */

const https = require('https')
const crypto = require('crypto')

// ─── 参数解析 ───────────────────────────────────────────────
const args = process.argv.slice(2)
const flags = {}
for (const arg of args) {
  const m = arg.match(/^--(\w+)=(.+)$/)
  if (m) flags[m[1]] = m[2]
}

const SECRET_ID = flags.secretId || process.env.TENCENT_SECRET_ID || process.env.SECRET_ID
const SECRET_KEY = flags.secretKey || process.env.TENCENT_SECRET_KEY || process.env.SECRET_KEY
const ENV_ID = flags.envId || process.env.TCB_ENV_ID || process.env.ENV_ID

if (!SECRET_ID || !SECRET_KEY || !ENV_ID) {
  console.error('❌ 缺少必要参数。请提供 TENCENT_SECRET_ID / TENCENT_SECRET_KEY / TCB_ENV_ID')
  console.error('')
  console.error('方式一：环境变量')
  console.error('  export TENCENT_SECRET_ID=xxx')
  console.error('  export TENCENT_SECRET_KEY=xxx')
  console.error('  export TCB_ENV_ID=xxx')
  console.error('  node scripts/init-test-data.js')
  console.error('')
  console.error('方式二：直接参数')
  console.error('  node scripts/init-test-data.js --secretId=xxx --secretKey=yyy --envId=zzz')
  process.exit(1)
}

// ─── 签名工具（V3 签名）──────────────────────────────────────
function signV3(method, path, query, body, secretKey, date, timestamp) {
  const hashedPayload = crypto.createHash('sha256').update(body || '').digest('hex')
  const canonicalRequest = [
    method,
    path,
    query,
    `content-type:application/json\nhost:tcb-db.tencentcsapi.com\nx-date:${date}`,
    '',
    'content-type;host;x-date',
    hashedPayload,
  ].join('\n')

  const signingKey = crypto.createHmac('sha256', `TC3-HMAC-SHA256\n${timestamp}\n31536000\n canonical/tcb_request\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`).digest()
  const signature = crypto.createHmac('sha256', secretKey).update(canonicalRequest).digest('hex')
  return signature
}

function tcrypto(secretKey, date, secretDate) {
  return crypto.createHmac('sha256', `TC3-HMAC-SHA256\n${secretDate}\n31536000\n`).digest()
}

// ─── 云数据库 HTTP API（免鉴权接口）───────────────────────────
// 微信云开发提供了免鉴权的数据库访问路径（需云开通）
// 这里用云开发环境凭证直接请求
async function callDB(collection, action, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ env: ENV_ID, collection, action, data })
    const date = new Date().toUTCString()
    const options = {
      hostname: 'tcb-db.tencentcsapi.com',
      path: '/v2/index',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': 'tcb-db.tencentcsapi.com',
        'X-Date': date,
        'Content-Length': Buffer.byteLength(body),
      },
    }

    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', chunk => raw += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(raw)) }
        catch { resolve(raw) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── 直接用微信云开发 SDK ────────────────────────────────────
let tcb = null
try {
  tcb = require('@cloudbase/node-sdk')
} catch {
  // 未安装 @cloudbase/node-sdk，使用 HTTP API
  tcb = null
}

const TEST_CUSTOMERS = [
  { nickName: '张小明', equityAlbum: 5, equityFrame: 3, totalCheckins: 12, avatarUrl: '' },
  { nickName: '李婷婷', equityAlbum: 8, equityFrame: 5, totalCheckins: 28, avatarUrl: '' },
  { nickName: '王建国', equityAlbum: 2, equityFrame: 1, totalCheckins: 5, avatarUrl: '' },
  { nickName: '陈丽娜', equityAlbum: 10, equityFrame: 8, totalCheckins: 45, avatarUrl: '' },
  { nickName: '刘伟', equityAlbum: 6, equityFrame: 4, totalCheckins: 18, avatarUrl: '' },
  { nickName: '赵雅静', equityAlbum: 3, equityFrame: 2, totalCheckins: 8, avatarUrl: '' },
  { nickName: '孙浩然', equityAlbum: 7, equityFrame: 6, totalCheckins: 22, avatarUrl: '' },
  { nickName: '周雨彤', equityAlbum: 4, equityFrame: 3, totalCheckins: 15, avatarUrl: '' },
  { nickName: '吴俊杰', equityAlbum: 9, equityFrame: 7, totalCheckins: 33, avatarUrl: '' },
  { nickName: '郑晓丽', equityAlbum: 1, equityFrame: 0, totalCheckins: 2, avatarUrl: '' },
]

async function main() {
  console.log(`\n🎬 AI写真馆 - 初始化测试数据`)
  console.log(`环境 ID: ${ENV_ID}`)
  console.log(`目标集合: customers`)
  console.log(`数据条数: ${TEST_CUSTOMERS.length}\n`)

  let app = null
  if (tcb) {
    try {
      app = tcb.init({ env: ENV_ID })
    } catch (e) {
      console.warn('tcb init 失败:', e.message)
    }
  }

  if (app) {
    const db = app.database()
    const inserted = []
    for (const customer of TEST_CUSTOMERS) {
      try {
        const res = await db.collection('customers').add({ data: customer })
        inserted.push(res.id)
        console.log(`  ✅ [${customer.nickName}] inserted, _id=${res.id}`)
      } catch (e) {
        console.log(`  ❌ [${customer.nickName}] failed: ${e.message}`)
      }
    }
    console.log(`\n✨ 完成！共插入 ${inserted.length} 条记录\n`)
  } else {
    // HTTP API fallback（需要有效凭证）
    console.log('⚠️  未安装 @cloudbase/node-sdk，请先安装：')
    console.log('   npm install @cloudbase/node-sdk')
    console.log('')
    console.log('   然后修改 .env 文件添加凭证后重试。\n')
    console.log('💡 或者直接在微信开发者工具中操作：')
    console.log('   打开「云开发」面板 → 数据库 → customers 集合 → 「添加记录」手动添加。\n')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('❌ 运行出错:', err.message)
  process.exit(1)
})
