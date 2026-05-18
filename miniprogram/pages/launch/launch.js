const { applySessionToApp, isValidStoreId } = require('../../utils/storeSession')

const STORE_HOME = '/pages/index/index'
const ENTRY = '/pages/launch/launch'

Page({
  data: {
    loading: true,
    status: '',
    storeName: ''
  },

  onShow() {
    this.bootstrap()
  },

  async bootstrap() {
    if (this._bootstrapping) return
    this._bootstrapping = true
    const app = getApp()
    this.setData({ loading: true })
    try {
      if (!app.globalData.openId) {
        await app.ensureLogin()
      }
      const account = await applySessionToApp(app)
      if (account.canUseStore && isValidStoreId(account.storeId)) {
        wx.reLaunch({ url: STORE_HOME, fail: () => {} })
        return
      }
      if (account.status === 'pending') {
        this.setData({
          loading: false,
          status: 'pending',
          storeName: account.storeName || ''
        })
        return
      }
      this.setData({ loading: false, status: 'entry' })
    } catch (e) {
      console.error('[launch]', e)
      this.setData({ loading: false, status: 'entry' })
    } finally {
      this._bootstrapping = false
    }
  },

  goCreateStore() {
    wx.navigateTo({ url: '/pages/launch/create-store' })
  },

  goJoin() {
    wx.navigateTo({ url: '/pages/join/join' })
  }
})
