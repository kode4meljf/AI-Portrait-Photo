/** 后台展示：优先店长称呼，否则微信昵称 */
export function getCustomerDisplayName(row) {
  if (!row) return '未命名'
  const nick = (row.nickName || '').trim()
  if (nick) return nick
  return (row.wxNickName || '').trim() || '未命名'
}

export function getAvatarInitial(row) {
  const name = getCustomerDisplayName(row)
  const ch = [...name][0]
  return ch || '?'
}
