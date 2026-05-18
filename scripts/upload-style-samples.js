#!/usr/bin/env node
/**
 * 将本地风格样图上传云存储并写入 style_templates.sampleFileId
 * 用法：node scripts/upload-style-samples.js [assets目录]
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const API =
  process.env.ADMIN_API_URL ||
  'https://ai-photo-0g22lzk94d0b6846-1422497778.ap-shanghai.app.tcloudbase.com/adminApi'
const USER = process.env.ADMIN_USERNAME || 'admin'
const PASS = process.env.ADMIN_PASSWORD || 'admin123'

const { ensureStyleAssetsDirs } = require('./styleAssetsDir')

const STYLE_FILES = [
  { id: 'S01', file: 'style-s01.jpg' },
  { id: 'S02', file: 'style-s02.jpg' },
  { id: 'S03', file: 'style-s03.jpg' },
  { id: 'S04', file: 'style-s04.jpg' },
  { id: 'S05', file: 'style-s05.jpg' },
  { id: 'S06', file: 'style-s06.jpg' },
  { id: 'S07', file: 'style-s07.jpg' },
  { id: 'S08', file: 'style-s08.jpg' },
  { id: 'S09', file: 'style-s09.jpg' }
]

async function post(body, token) {
  const res = await fetch(API, {
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

/** 用 Pillow 裁成真实 3:4（macOS sips 会垫黑边，不可用） */
function prepareJpegBase64(srcPath) {
  const script = path.join(__dirname, 'crop-style-sample.py')
  const tmp = path.join('/tmp', `style-upload-${path.basename(srcPath, path.extname(srcPath))}.jpg`)
  execSync(`python3 "${script}" "${srcPath}" "${tmp}"`, { stdio: 'pipe' })
  return fs.readFileSync(tmp).toString('base64')
}

async function main() {
  const { out34: defaultDir, root: assetsRoot } = ensureStyleAssetsDirs()
  const assetsDir = process.argv[2] || defaultDir
  console.log(`素材目录：${assetsRoot}`)

  const login = await post({ action: 'login', username: USER, password: PASS })
  const token = login.token

  const listRes = await post({ action: 'styles.list', page: 1, pageSize: 20 }, token)
  const byId = {}
  ;(listRes.list || []).forEach((row) => {
    byId[row.id] = row
  })

  for (const item of STYLE_FILES) {
    const src = path.join(assetsDir, item.file)
    if (!fs.existsSync(src)) {
      throw new Error(`找不到文件: ${src}`)
    }
    const row = byId[item.id]
    if (!row || !row._id) {
      throw new Error(`云库中无风格 ${item.id}，请先执行 npm run seed:styles`)
    }

    console.log(`上传 ${item.id} …`)
    const base64 = prepareJpegBase64(src)
    const upload = await post({ action: 'styles.uploadSample', base64, mimeType: 'image/jpeg' }, token)
    await post(
      {
        action: 'styles.update',
        _id: row._id,
        sampleFileId: upload.sampleFileId
      },
      token
    )
    console.log(`  ✓ ${item.id} ${row.name} → ${upload.sampleFileId}`)
  }

  console.log('全部完成')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
