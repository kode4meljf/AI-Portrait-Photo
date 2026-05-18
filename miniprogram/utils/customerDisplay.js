/**
 * 客户展示名：有客户称呼用称呼，否则用微信昵称
 */
function getCustomerDisplayName(customer) {
  if (!customer) return '匿名用户'
  const alias = (customer.nickName || '').trim()
  if (alias) return alias
  const wx = (customer.wxNickName || '').trim()
  return wx || '匿名用户'
}

module.exports = {
  getCustomerDisplayName
}
