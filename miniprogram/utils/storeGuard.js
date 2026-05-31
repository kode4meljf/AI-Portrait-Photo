const { resolveSessionIfNeeded } = require('./storeSession')
const { isSessionDirty } = require('./sessionDirty')

const CUSTOMER_HOME = '/packageCustomer/pages/home/home'

async function redirectCustomerIfNeeded() {
  const app = getApp()
  if (!isSessionDirty(app) && app.globalData.accountKind === 'customer') {
    wx.reLaunch({ url: CUSTOMER_HOME })
    return true
  }
  const account = await resolveSessionIfNeeded(app)
  if (account.accountKind === 'customer') {
    wx.reLaunch({ url: CUSTOMER_HOME })
    return true
  }
  return false
}

module.exports = { redirectCustomerIfNeeded, CUSTOMER_HOME }
