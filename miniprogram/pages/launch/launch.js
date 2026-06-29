const { applySessionToApp, isValidStoreId } = require('../../utils/storeSession')
const {
  clearSessionDirty,
  isSessionDirty,
  shouldSkipLaunchBootstrap
} = require('../../utils/sessionDirty')

const STORE_HOME = '/pages/index/index'
const CUSTOMER_HOME = '/packageCustomer/pages/home/home'
const REGISTER_PAGE = '/pages/customer-register/register'

function shouldShowEntryInsteadOfDisabled(app, account) {
  const dismissedStoreId = app.globalData.launchDismissStoreId
  if (!dismissedStoreId || !account || account.status !== 'disabled') return false
  return dismissedStoreId === account.storeId
}

Page({
  behaviors: [require('../../behaviors/pageShare')],
  data: {
    loading: true,
    status: '',
    storeName: '',
    registerToken: ''
  },

  onLoad(options) {
    const token = (options.token || options.scene || '').trim()
    if (token) {
      this.setData({ registerToken: token })
    }
  },

  onShow() {
    if (this.data.registerToken) {
      this.bootstrap()
      return
    }
    const app = getApp()
    if (
      shouldSkipLaunchBootstrap({
        force: false,
        sessionDirty: isSessionDirty(app),
        status: this.data.status
      })
    ) {
      return
    }
    this.bootstrap()
  },

  onForceBootstrap() {
    this.bootstrap({ force: true })
  },

  async bootstrap(options = {}) {
    const force = !!(options && options.force)
    if (this._bootstrapping) return

    const app = getApp()
    if (
      shouldSkipLaunchBootstrap({
        force,
        sessionDirty: isSessionDirty(app),
        status: this.data.status
      })
    ) {
      return
    }

    this._bootstrapping = true
    const showFullLoading = force || isSessionDirty(app) || !this.data.status
    if (showFullLoading) {
      this.setData({ loading: true })
    }

    try {
      if (!app.globalData.openId) {
        await app.ensureLogin()
      }

      const registerToken = this.data.registerToken
      if (registerToken) {
        wx.redirectTo({
          url: `${REGISTER_PAGE}?token=${encodeURIComponent(registerToken)}`
        })
        return
      }

      const account = await applySessionToApp(app)

      if (account.accountKind === 'store') {
        if (account.canUseStore && isValidStoreId(account.storeId)) {
          clearSessionDirty(app)
          wx.reLaunch({ url: STORE_HOME })
          return
        }
        if (account.status === 'pending') {
          app.globalData.launchDismissStoreId = null
          this.setData({
            loading: false,
            status: 'pending',
            storeName: account.storeName || ''
          })
          clearSessionDirty(app)
          return
        }
        if (account.status === 'disabled' && account.approvedAt) {
          if (shouldShowEntryInsteadOfDisabled(app, account)) {
            this.setData({ loading: false, status: 'entry', storeName: '' })
            clearSessionDirty(app)
            return
          }
          this.setData({
            loading: false,
            status: 'removed',
            storeName: account.storeName || ''
          })
          clearSessionDirty(app)
          return
        }
        if (account.status === 'disabled') {
          if (shouldShowEntryInsteadOfDisabled(app, account)) {
            this.setData({ loading: false, status: 'entry', storeName: '' })
            clearSessionDirty(app)
            return
          }
          this.setData({
            loading: false,
            status: 'rejected',
            storeName: account.storeName || ''
          })
          clearSessionDirty(app)
          return
        }
        console.warn('[launch] store member but cannot use store', account)
        this.setData({
          loading: false,
          status: 'entry',
          storeName: account.storeName || ''
        })
        clearSessionDirty(app)
        return
      }

      if (account.accountKind === 'customer') {
        clearSessionDirty(app)
        wx.reLaunch({ url: CUSTOMER_HOME })
        return
      }

      this.setData({ loading: false, status: 'entry' })
      clearSessionDirty(app)
    } catch (e) {
      console.error('[launch]', e)
      this.setData({ loading: false, status: 'entry' })
      clearSessionDirty(app)
    } finally {
      this._bootstrapping = false
    }
  },

  goCreateStore() {
    wx.navigateTo({ url: '/pages/launch/create-store' })
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/join/join' })
  },

  showEntry() {
    const app = getApp()
    const membership = app.globalData.membership
    if (membership && membership.storeId && membership.status === 'disabled') {
      app.globalData.launchDismissStoreId = membership.storeId
    }
    this.setData({ loading: false, status: 'entry', storeName: '' })
  },

  goCustomerRegisterHint() {
    wx.showModal({
      title: '客户注册',
      content: '请使用门店发给您的注册链接或二维码完成注册。若已有账号，请确认链接未过期。',
      showCancel: false
    })
  }
})
