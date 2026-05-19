const { applySessionToApp } = require('./storeSession')

const CUSTOMER_HOME = '/packageCustomer/pages/home/home'
const LAUNCH = '/pages/launch/launch'

async function ensureCustomerPage(pageInstance) {
  const app = getApp()
  if (!app.globalData.openId) {
    await app.ensureLogin()
  }
  const account = await applySessionToApp(app)
  if (account.accountKind === 'store' && account.canUseStore) {
    wx.reLaunch({ url: '/pages/index/index' })
    return false
  }
  if (account.accountKind !== 'customer') {
    wx.reLaunch({ url: LAUNCH })
    return false
  }
  return true
}

module.exports = { ensureCustomerPage, CUSTOMER_HOME, LAUNCH }
