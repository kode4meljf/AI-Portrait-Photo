const { resolveSessionIfNeeded } = require('../../utils/storeSession')
const { reLaunchLaunch } = require('../../utils/sessionDirty')
const { isDevCustomerPreview } = require('../../utils/devCustomerPreview')

const CUSTOMER_HOME = '/packageCustomer/pages/home/home'
const LAUNCH = '/pages/launch/launch'

function hideWechatHomeButton() {
  if (typeof wx.hideHomeButton === 'function') {
    wx.hideHomeButton()
  }
}

async function ensureCustomerPage(pageInstance) {
  hideWechatHomeButton()
  const app = getApp()
  const account = await resolveSessionIfNeeded(app)
  const devPreview = isDevCustomerPreview()
  if (account.accountKind === 'store' && account.canUseStore) {
    if (devPreview) return true
    wx.reLaunch({ url: '/pages/index/index' })
    return false
  }
  if (account.accountKind !== 'customer') {
    if (devPreview) return true
    reLaunchLaunch()
    return false
  }
  return true
}

module.exports = { ensureCustomerPage, CUSTOMER_HOME, LAUNCH }
