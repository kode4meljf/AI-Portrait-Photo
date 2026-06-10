/** 生产环境安全配置校验（云函数环境变量 PRODUCTION=1 时启用严格模式） */

const DEFAULT_JWT = 'change-me-in-cloud-console'
const DEFAULT_PASS = 'admin123'

function isProduction() {
  const v = String(process.env.PRODUCTION || process.env.ENVIRONMENT || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'production' || v === 'prod'
}

function isTruthy(v) {
  return v === 'true' || v === '1' || v === true
}

function collectSecurityIssues() {
  const issues = []
  const secret = String(process.env.ADMIN_JWT_SECRET || process.env.ADMIN_API_SECRET || '').trim()
  if (!secret || secret === DEFAULT_JWT) {
    issues.push('ADMIN_JWT_SECRET 未配置或为默认值')
  }
  if (!process.env.ADMIN_PASSWORD || String(process.env.ADMIN_PASSWORD) === DEFAULT_PASS) {
    issues.push('ADMIN_PASSWORD 未配置或为弱口令 admin123')
  }
  if (isTruthy(process.env.ADMIN_SMS_MOCK)) {
    issues.push('ADMIN_SMS_MOCK 已开启')
  }
  if (isTruthy(process.env.WX_PAY_MOCK)) {
    issues.push('WX_PAY_MOCK 已开启')
  }
  return issues
}

function assertProductionSecurity(context) {
  if (!isProduction()) return
  const issues = collectSecurityIssues()
  if (!issues.length) return
  const err = new Error(`[${context || 'cloud'}] 生产安全配置不合规：${issues.join('；')}`)
  err.code = 'PRODUCTION_SECURITY'
  throw err
}

function warnIfInsecure(context) {
  const issues = collectSecurityIssues()
  if (issues.length) {
    console.warn(`[${context || 'cloud'}] 安全配置警告（上线前请处理）:`, issues.join('；'))
  }
}

module.exports = {
  isProduction,
  collectSecurityIssues,
  assertProductionSecurity,
  warnIfInsecure
}
