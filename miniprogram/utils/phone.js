const MOBILE_RE = /^1\d{10}$/

function isValidMobilePhone(phone) {
  return MOBILE_RE.test(String(phone || '').trim())
}

function normalizeMobilePhone(phone) {
  const p = String(phone || '').trim()
  if (!p) return { ok: false, error: '请填写手机号' }
  if (!MOBILE_RE.test(p)) return { ok: false, error: '请输入正确的 11 位手机号' }
  return { ok: true, phone: p }
}

module.exports = { isValidMobilePhone, normalizeMobilePhone, MOBILE_RE }
