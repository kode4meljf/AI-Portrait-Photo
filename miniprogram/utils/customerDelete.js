const { getCustomerDisplayName } = require('./customerDisplay')

function canShowDeleteCustomer(customer, app) {
  if (!customer) return false
  if ((customer.wxOpenId || '').trim()) return false
  if ((customer.source || '').trim() !== 'store_create') return false
  const role = app && app.globalData && app.globalData.storeRole
  const openId = app && app.globalData && app.globalData.openId
  if (role === 'owner') return true
  return !!(openId && (customer.createdBy || '').trim() === openId)
}

function confirmDeleteCustomer(customer) {
  const name = getCustomerDisplayName(customer) || '该客户'
  const phone = (customer.phone || '').trim()
  const phoneHint = phone ? `\n手机号：${phone}` : ''
  return new Promise((resolve) => {
    wx.showModal({
      title: '删除客户档案',
      content: `确定删除「${name}」？${phoneHint}\n\n将永久删除档案及云端头像、打卡码等资源，不可恢复。`,
      confirmText: '删除',
      confirmColor: '#e91e8c',
      cancelText: '取消',
      success: (res) => resolve(!!res.confirm)
    })
  })
}

module.exports = { canShowDeleteCustomer, confirmDeleteCustomer }
