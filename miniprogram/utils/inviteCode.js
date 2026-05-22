/**
 * 店员邀请码：二维码内容构建与扫码解析
 * 二维码文本格式：pages/join/join?token=xxx（与 join 页 onLoad 一致）
 */

const JOIN_QR_PREFIX = 'pages/join/join'

function buildInviteQrContent(token) {
  const t = (token || '').trim()
  if (!t) return ''
  return `${JOIN_QR_PREFIX}?token=${encodeURIComponent(t)}`
}

function parseInviteFromScan(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''

  const tokenFromQuery = (str) => {
    const m = str.match(/[?&]token=([^&#\s]+)/i)
    if (m && m[1]) {
      try {
        return decodeURIComponent(m[1]).trim()
      } catch (_) {
        return m[1].trim()
      }
    }
    return ''
  }

  const fromQuery = tokenFromQuery(s)
  if (fromQuery) return fromQuery

  if (s.includes(JOIN_QR_PREFIX)) {
    const q = tokenFromQuery(s.includes('?') ? s.slice(s.indexOf('?')) : `?${s}`)
    if (q) return q
  }

  // 小程序码 scene 直接传 token
  if (/^[a-z0-9]{6,32}$/i.test(s)) return s

  return ''
}

const REGISTER_QR_PREFIX = 'pages/customer-register/register'

function buildCustomerRegisterQrContent(token) {
  const t = (token || '').trim()
  if (!t) return ''
  return `${REGISTER_QR_PREFIX}?token=${encodeURIComponent(t)}`
}

function parseCustomerRegisterFromScan(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''

  const tokenFromQuery = (str) => {
    const m = str.match(/[?&]token=([^&#\s]+)/i)
    if (m && m[1]) {
      try {
        return decodeURIComponent(m[1]).trim()
      } catch (_) {
        return m[1].trim()
      }
    }
    return ''
  }

  const fromQuery = tokenFromQuery(s)
  if (fromQuery) return fromQuery

  if (s.includes(REGISTER_QR_PREFIX)) {
    const q = tokenFromQuery(s.includes('?') ? s.slice(s.indexOf('?')) : `?${s}`)
    if (q) return q
  }

  if (/^[a-z0-9]{6,32}$/i.test(s)) return s

  return ''
}

module.exports = {
  buildInviteQrContent,
  parseInviteFromScan,
  JOIN_QR_PREFIX,
  buildCustomerRegisterQrContent,
  parseCustomerRegisterFromScan,
  REGISTER_QR_PREFIX
}
