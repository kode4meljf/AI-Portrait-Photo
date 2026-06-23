/**
 * 云函数运行时不需要 protobufjs CLI、@types 等，postinstall 后删除以减小体积。
 */
const fs = require('fs')
const path = require('path')

const nodeModules = path.join(__dirname, '..', 'node_modules')
const targets = [
  path.join(nodeModules, 'protobufjs', 'cli'),
  path.join(nodeModules, '@types')
]

for (const dir of targets) {
  if (!fs.existsSync(dir)) continue
  fs.rmSync(dir, { recursive: true, force: true })
  console.log('[adminApi postinstall] removed', path.relative(nodeModules, dir))
}
