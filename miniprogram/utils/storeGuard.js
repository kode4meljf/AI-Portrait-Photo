const { applySessionToApp } = require('./storeSession')

const CUSTOMER_HOME = '/packageCustomer/pages/home/home'

async function redirectCustomerIfNeeded() {
  const app = getApp()
  if (app.globalData.accountKind === 'customer') {
    wx.reLaunch({ url: CUSTOMER_HOME })
    return true
  }
  if (!app.globalData.openId) {
    await app.ensureLogin()
  }
  const account = await applySessionToApp(app)
  if (account.accountKind === 'customer') {
    wx.reLaunch({ url: CUSTOMER_HOME })
    return true
  }
  return false
}

module.exports = { redirectCustomerIfNeeded, CUSTOMER_HOME }
