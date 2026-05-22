const { applySessionToApp, isValidStoreId } = require('../../utils/storeSession')

const STORE_HOME = '/pages/index/index'
const CUSTOMER_HOME = '/packageCustomer/pages/home/home'
const REGISTER_PAGE = '/pages/customer-register/register'
const ENTRY = '/pages/launch/launch'

Page({
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
          wx.reLaunch({ url: STORE_HOME })
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
        if (account.status === 'disabled' && account.approvedAt) {
          this.setData({
            loading: false,
            status: 'removed',
            storeName: account.storeName || ''
          })
          return
        }
        if (account.status === 'disabled') {
          this.setData({
            loading: false,
            status: 'rejected',
            storeName: account.storeName || ''
          })
          return
        }
        this.setData({ loading: false, status: 'entry' })
        return
      }

      if (account.accountKind === 'customer') {
        wx.reLaunch({ url: CUSTOMER_HOME })
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
  },

  showEntry() {
    this.setData({ status: 'entry', storeName: '' })
  },

  goCustomerRegisterHint() {
    wx.showModal({
      title: '客户注册',
      content: '请使用门店发给您的注册链接或二维码完成注册。若已有账号，请确认链接未过期。',
      showCancel: false
    })
  }
})
