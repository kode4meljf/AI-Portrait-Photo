const MOBILE_RE = /^1\d{10}$/

function isValidMobilePhone(phone) {
  return MOBILE_RE.test(String(phone || '').trim())
}

function stripPhoneDigits(raw) {
  let p = String(raw || '').trim().replace(/\s+/g, '')
  if (p.startsWith('+86')) p = p.slice(3)
  else if (p.startsWith('86') && p.length === 13) p = p.slice(2)
  return p
}

function normalizeMobilePhone(phone) {
  const p = stripPhoneDigits(phone)
  if (!p) return { ok: false, error: '请填写手机号' }
  if (!MOBILE_RE.test(p)) return { ok: false, error: '请输入正确的 11 位手机号' }
  return { ok: true, phone: p }
}

/** 列表展示用脱敏，完整号码仍保留在 phone 字段 */
function maskPhoneForDisplay(phone) {
  const p = String(phone || '').trim()
  if (!p) return '未绑定手机'
  if (/^\d{11}$/.test(p)) return `${p.slice(0, 3)}****${p.slice(7)}`
  return p
}

module.exports = {
  isValidMobilePhone,
  normalizeMobilePhone,
  stripPhoneDigits,
  maskPhoneForDisplay,
  MOBILE_RE
}
