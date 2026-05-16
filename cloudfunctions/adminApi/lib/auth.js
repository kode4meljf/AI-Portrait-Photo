const crypto = require('crypto')

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

function getSecret() {
  return process.env.ADMIN_JWT_SECRET || process.env.ADMIN_API_SECRET || 'change-me-in-cloud-console'
}

function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
  }
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
  const creds = getAdminCredentials()
  if (username !== creds.username || password !== creds.password) {
    return { success: false, error: '用户名或密码错误' }
  }
  return {
    success: true,
    token: signToken(username),
    expiresIn: TOKEN_TTL_MS,
    user: { username, role: 'admin' }
  }
}

module.exports = {
  login,
  verifyToken,
  getAdminCredentials
}
