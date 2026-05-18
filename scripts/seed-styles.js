#!/usr/bin/env node
/**
 * 将 S01–S09 写入云库 style_templates（需已部署 adminApi styles.seedDefaults）
 * 用法：npm run seed:styles
 */
const API =
  process.env.ADMIN_API_URL ||
  'https://ai-photo-0g22lzk94d0b6846-1422497778.ap-shanghai.app.tcloudbase.com/adminApi'
const USER = process.env.ADMIN_USERNAME || 'admin'
const PASS = process.env.ADMIN_PASSWORD || 'admin123'

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

async function main() {
  const login = await post({ action: 'login', username: USER, password: PASS })
  const result = await post({ action: 'styles.seedDefaults' }, login.token)
  console.log('seedDefaults:', result)
  const list = await post({ action: 'styles.list', page: 1, pageSize: 20 }, login.token)
  console.log(`style_templates 共 ${list.total} 条，启用 ${list.enabledCount} 条`)
  if (list.list?.length) {
    list.list.forEach((row) => console.log(`  ${row.id} ${row.name}`))
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
