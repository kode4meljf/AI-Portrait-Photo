const crypto = require('crypto')

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

function getSecret() {
  return process.env.ADMIN_JWT_SECRET || process.env.ADMIN_API_SECRET || 'change-me-in-cloud-console'
}

/**
 * 后台账号列表（用于登录与资产审核「不能自审」）
 *
 * 1) 主账号：ADMIN_USERNAME + ADMIN_PASSWORD
 * 2) 审核账号（可选）：ADMIN_AUDIT_USERNAME + ADMIN_AUDIT_PASSWORD
 * 3) 更多账号（可选）：ADMIN_USERS_JSON = [{"username":"u","password":"p"}, ...]
 */
function getAdminAccounts() {
  const map = new Map()

  const primaryUser = (process.env.ADMIN_USERNAME || 'admin').trim()
  const primaryPass = process.env.ADMIN_PASSWORD || 'admin123'
  if (primaryUser) map.set(primaryUser, primaryPass)

  const auditUser = (process.env.ADMIN_AUDIT_USERNAME || '').trim()
  const auditPass = process.env.ADMIN_AUDIT_PASSWORD || ''
  if (auditUser && auditPass) map.set(auditUser, auditPass)

  const jsonRaw = (process.env.ADMIN_USERS_JSON || '').trim()
  if (jsonRaw) {
    let parsed
    try {
      parsed = JSON.parse(jsonRaw)
    } catch {
      throw new Error('ADMIN_USERS_JSON 不是合法 JSON')
    }
    if (!Array.isArray(parsed)) throw new Error('ADMIN_USERS_JSON 须为数组')
    parsed.forEach((row) => {
      const username = String(row?.username || '').trim()
      const password = row?.password
      if (!username || password == null || password === '') return
      map.set(username, String(password))
    })
  }

  return [...map.entries()].map(([username, password]) => ({ username, password }))
}

function getAdminCredentials() {
  const accounts = getAdminAccounts()
  return accounts[0] || { username: 'admin', password: 'admin123' }
}

function signToken(username) {
  const payload = {
    sub: username,
    role: 'admin',
    exp: Date.now() + TOKEN_TTL_MS
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
  return `${body}.${sig}`
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const parts = token.replace(/^Bearer\s+/i, '').trim().split('.')
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url')
  if (sig !== expected) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.exp || Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function login(username, password) {
  const name = String(username || '').trim()
  const pass = String(password || '')
  const accounts = getAdminAccounts()
  const matched = accounts.find((row) => row.username === name && row.password === pass)
  if (!matched) {
    return { success: false, error: '用户名或密码错误' }
  }
  return {
    success: true,
    token: signToken(matched.username),
    expiresIn: TOKEN_TTL_MS,
    user: { username: matched.username, role: 'admin' }
  }
}

module.exports = {
  login,
  verifyToken,
  getAdminCredentials,
  getAdminAccounts
}
