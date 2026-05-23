const SOURCE_LABELS = {
  store_create: '门店建档',
  link_register: '邀请注册',
  self_register: '扫码注册'
}

function getCustomerDisplayName(row) {
  const nick = (row.nickName || '').trim()
  if (nick) return nick
  return (row.wxNickName || '').trim() || '未命名'
}

function getAvatarInitial(row) {
  const name = getCustomerDisplayName(row)
  const ch = [...name][0]
  return ch || '?'
}

function formatDateTime(value) {
  if (value == null || value === '') return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', { hour12: false })
}

function formatCustomerForAdmin(row) {
  const displayName = getCustomerDisplayName(row)
  const wxNick = (row.wxNickName || '').trim()
  const nick = (row.nickName || '').trim()
  const hasWx = Boolean((row.wxOpenId || '').trim())

  return {
    ...row,
    displayName,
    avatarInitial: getAvatarInitial(row),
    wxNickNameDisplay: wxNick || '—',
    showWxNickName: Boolean(nick && wxNick && nick !== wxNick),
    sourceLabel: SOURCE_LABELS[row.source] || row.source || '—',
    registeredLabel: hasWx ? '已注册' : '未注册',
    registered: hasWx,
    remarkDisplay: (row.remark || '').trim() || '—',
    createTimeText: formatDateTime(row.createTime)
  }
}

module.exports = {
  formatCustomerForAdmin,
  getCustomerDisplayName,
  getAvatarInitial
}
