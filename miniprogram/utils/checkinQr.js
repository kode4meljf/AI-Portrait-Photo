/**
 * 门店扫码打卡内容（与云函数 buildCheckinQrPayload 字段一致）
 */
function buildCheckinQrPayload(customer, openId) {
  if (!customer || !customer.customerId) return ''
  const payload = {
    type: 'customer_checkin',
    customerId: customer.customerId
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
