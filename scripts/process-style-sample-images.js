#!/usr/bin/env node
/**
 * 将 styles-raw 横图批量裁为 3:4，输出到桌面 AI写真/styles-34
 * 用法：node scripts/process-style-sample-images.js [S01]
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { ensureStyleAssetsDirs } = require('./styleAssetsDir')
const CROP_PY = path.join(__dirname, 'crop-style-sample.py')
const { SEED_STYLES } = require('./styleSampleImagePrompt')

function rawPath(rawDir, id) {
  const n = id.toLowerCase()
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
    const p = path.join(rawDir, `${n}-raw${ext}`)
    if (fs.existsSync(p)) return p
  }
  return null
}

function main() {
  const { root, raw: RAW_DIR, out34: OUT_DIR } = ensureStyleAssetsDirs()
  const onlyId = process.argv[2]
  const ids = onlyId ? [onlyId.toUpperCase()] : SEED_STYLES.map((s) => s.id)

  let ok = 0

  for (const id of ids) {
    const src = rawPath(RAW_DIR, id)
    if (!src) {
      console.warn(`跳过 ${id}：未找到 ${RAW_DIR}/${id.toLowerCase()}-raw.*`)
      continue
    }
    const dest = path.join(OUT_DIR, `style-${id.toLowerCase()}.jpg`)
    execSync(`python3 "${CROP_PY}" "${src}" "${dest}"`, { stdio: 'pipe' })
    console.log(`✓ ${id} → ${dest}`)
    ok += 1
  }

  if (!ok) {
    console.error(`没有处理任何文件，请先将横图放入：\n  ${RAW_DIR}/\n（如 s01-raw.png）`)
    process.exit(1)
  }
  console.log(`\n完成 ${ok} 张（目录：${root}），可执行 npm run upload:style-samples 上传`)
}

main()
