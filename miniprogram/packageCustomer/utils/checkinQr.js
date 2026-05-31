const { normalizeMobilePhone } = require('../../utils/phone')

/**
 * 门店扫码打卡内容（与云函数 buildCheckinQrPayload 字段一致）
 * 无有效手机号时返回空字符串，不可生成打卡码
 */
function buildCheckinQrPayload(customer, openId) {
  if (!customer || !customer._id) return ''

  const phoneResult = normalizeMobilePhone(customer.phone)
  if (!phoneResult.ok) return ''

  const payload = {
    type: 'customer_checkin',
    customerDocId: customer._id,
    phone: phoneResult.phone
  }
  const wxNickName = (customer.wxNickName || '').trim()
  const avatarUrl = (customer.avatarUrl || '').trim()
  const wxOpenId = (openId || customer.wxOpenId || '').trim()
  if (wxNickName) payload.wxNickName = wxNickName
  if (avatarUrl) payload.avatarUrl = avatarUrl
  if (wxOpenId) payload.wxOpenId = wxOpenId
  return JSON.stringify(payload)
}

module.exports = { buildCheckinQrPayload }
