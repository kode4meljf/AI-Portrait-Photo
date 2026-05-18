/**
 * 风格样图等开发用素材目录（不在小程序项目内，避免预览包超限）
 * 默认：~/Desktop/AI写真
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const STYLE_ASSETS_ROOT =
  process.env.AI_PORTRAIT_ASSETS_DIR ||
  path.join(os.homedir(), 'Desktop', 'AI写真')

function ensureStyleAssetsDirs() {
  const dirs = [
    STYLE_ASSETS_ROOT,
    path.join(STYLE_ASSETS_ROOT, 'styles-raw'),
    path.join(STYLE_ASSETS_ROOT, 'styles-34'),
    path.join(STYLE_ASSETS_ROOT, 'styles'),
    path.join(STYLE_ASSETS_ROOT, 'styles-generated')
  ]
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }))
  return {
    root: STYLE_ASSETS_ROOT,
    raw: dirs[1],
    out34: dirs[2],
    styles: dirs[3],
    generated: dirs[4]
  }
}

module.exports = {
  STYLE_ASSETS_ROOT,
  ensureStyleAssetsDirs
}
