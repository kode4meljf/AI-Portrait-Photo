/** 打卡二维码 / 扫码内容：携带 customerId 与当前微信资料，供 scan.bindCheckin 更新 */
function buildCheckinQrPayload(row) {
  const customerId = row.customerId || row.id
  if (!customerId) return ''
  const payload = {
    type: 'customer_checkin',
    customerId
  }
  const wxNickName = (row.wxNickName || '').trim()
  const avatarUrl = (row.avatarUrl || '').trim()
  const wxOpenId = (row.wxOpenId || '').trim()
  if (wxNickName) payload.wxNickName = wxNickName
  if (avatarUrl) payload.avatarUrl = avatarUrl
  if (wxOpenId) payload.wxOpenId = wxOpenId
  return JSON.stringify(payload)
}

module.exports = { buildCheckinQrPayload }
