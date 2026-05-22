const { applySessionToApp } = require('./storeSession')
const { ensureCustomerPage } = require('./customerGuard')

/** 风格画册内页：门店成员与注册顾客均可进入 */
async function ensureStyleShowcasePage() {
  const app = getApp()
  if (!app.globalData.openId) {
    await app.ensureLogin()
  }
  const account = await applySessionToApp(app)
  if (account.accountKind === 'store' && account.canUseStore) {
    return { ok: true, isStore: true }
  }
  const page = { route: 'packageCustomer/pages/showcase/showcase' }
  const ok = await ensureCustomerPage(page)
  return { ok, isStore: false }
}

module.exports = { ensureStyleShowcasePage }
