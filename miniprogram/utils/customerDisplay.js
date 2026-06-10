/**
 * 门店端展示名：优先店长称呼 nickName，否则微信昵称
 */
function getCustomerDisplayName(customer) {
  if (!customer) return '匿名用户'
  const alias = (customer.nickName || '').trim()
  if (alias) return alias
  const wx = (customer.wxNickName || '').trim()
  return wx || '匿名用户'
}

/** 列表/筛选提示：≤4 字完整；>4 字首...尾 */
function compactDisplayName(name) {
  const t = (name || '').trim()
  if (!t) return '客户'
  if (t.length <= 4) return t
  return t[0] + '...' + t[t.length - 1]
}

/** 顾客端展示名：仅微信昵称（不展示 nickName） */
function getCustomerWxDisplayName(customer) {
  if (!customer) return '微信用户'
  return (customer.wxNickName || '').trim() || '微信用户'
}

module.exports = {
  getCustomerDisplayName,
  getCustomerWxDisplayName,
  compactDisplayName
}
