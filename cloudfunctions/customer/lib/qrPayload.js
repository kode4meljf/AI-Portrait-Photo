const { normalizeMobilePhone } = require('./phone')

/** 打卡二维码：须含 customers._id 与手机号，供 scan.bindCheckin 校验 */
function buildCheckinQrPayload(row) {
  const customerDocId = (row && (row._id || row.id)) || ''
  const phoneRaw = (row && row.phone) || ''
  if (!customerDocId) return ''

  let phone
  try {
    phone = normalizeMobilePhone(phoneRaw)
  } catch (e) {
    return ''
  }

  const payload = {
    type: 'customer_checkin',
    customerDocId,
    phone
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
