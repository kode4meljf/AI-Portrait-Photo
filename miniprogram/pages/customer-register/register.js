const app = getApp()
const { callCustomer } = require('../../utils/customerApi')
const { applySessionToApp } = require('../../utils/storeSession')
const { clearSessionDirty } = require('../../utils/sessionDirty')
const { parseCustomerRegisterFromScan } = require('../../utils/inviteCode')
const { requireLegalAgreed } = require('../../utils/legalConsent')

const CUSTOMER_HOME = '/packageCustomer/pages/home/home'
const RESCAN_TOAST = '请重新扫描门店注册小程序码'

Page({
  data: {
    token: '',
    tokenInvalid: false,
    loading: true,
    submitting: false,
    storeName: '',
    storePreview: null,
    storeInfoVisible: false,
    avatarUrl: '',
    wxNickName: '',
    phoneReady: false,
    phoneCode: '',
    legalAgreed: false
  },

  onLoad(options) {
    const raw = (options && (options.token || options.scene)) || ''
    const token = parseCustomerRegisterFromScan(raw) || String(raw).trim()
    if (!token) {
      this.setData({ loading: false, tokenInvalid: true })
      this.toastNeedRescan()
      return
    }
    this.setData({ token })
    this.loadPreview()
  },

  onShow() {
    if (typeof wx.hideHomeButton === 'function') {
      wx.hideHomeButton()
    }
    wx.stopPullDownRefresh()
  },

  /** 扫码进入时微信可能仍展示「主页」；默认会进 tabBar 门店首页，此处拦截 */
  onHomeIconButtonTap() {
    if (this.data.tokenInvalid || !this.data.token) {
      this.toastNeedRescan()
      return
    }
    wx.showToast({ title: '请完成注册', icon: 'none' })
  },

  toastNeedRescan() {
    wx.showToast({ title: RESCAN_TOAST, icon: 'none', duration: 2800 })
  },

  requireToken() {
    if (this.data.tokenInvalid || !(this.data.token || '').trim()) {
      this.toastNeedRescan()
      return false
    }
    return true
  },

  async loadPreview() {
    this.setData({ loading: true })
    try {
      const data = await callCustomer('register.preview', { token: this.data.token })
      const storeName = data.storeName || ''
      this.setData({
        storeName,
        storePreview: {
          storeName,
          contactName: data.contactName || '暂未填写',
          address: data.address || '暂未填写'
        },
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showModal({
        title: '无法注册',
        content: e.message || '链接无效',
        showCancel: false,
        success: () => wx.exitMiniProgram({ fail: () => {} })
      })
    }
  },

  onStoreChipTap() {
    if (!this.requireToken()) return
    if (!this.data.storePreview) return
    this.setData({ storeInfoVisible: true })
  },

  onBlockedTap() {
    this.toastNeedRescan()
  },

  closeStoreInfo() {
    this.setData({ storeInfoVisible: false })
  },

  preventTouchMove() {},

  preventBubble() {},

  onLegalConsentChange(e) {
    this.setData({ legalAgreed: !!(e.detail && e.detail.agreed) })
  },

  onChooseAvatar(e) {
    if (!this.requireToken()) return
    if (!requireLegalAgreed(this.data.legalAgreed)) return
    const url = e.detail.avatarUrl || ''
    if (url) this.setData({ avatarUrl: url })
  },

  onNicknameInput(e) {
    this.setData({ wxNickName: (e.detail.value || '').trim() })
  },

  onGetPhoneNumber(e) {
    if (!requireLegalAgreed(this.data.legalAgreed)) return
    if (e.detail.errMsg && !e.detail.errMsg.includes('ok')) {
      wx.showToast({ title: '需授权手机号才能完成注册', icon: 'none' })
      return
    }
    const code = e.detail.code
    if (!code) {
      wx.showToast({ title: '未获取到手机号授权', icon: 'none' })
      return
    }
    this.setData({ phoneCode: code, phoneReady: true })
    wx.showToast({ title: '手机号已授权', icon: 'success' })
  },

  async onSubmit() {
    if (!this.requireToken()) return
    if (!requireLegalAgreed(this.data.legalAgreed)) return
    if (this.data.submitting) return
    if (!this.data.phoneReady || !this.data.phoneCode) {
      wx.showToast({ title: '请先授权手机号', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    let uploadedAvatarFileID = ''
    try {
      if (!app.globalData.openId) {
        await app.ensureLogin()
      }

      let avatarUrl = this.data.avatarUrl
      if (avatarUrl && !avatarUrl.startsWith('cloud://') && !avatarUrl.startsWith('https://')) {
        const ext = avatarUrl.includes('.') ? avatarUrl.slice(avatarUrl.lastIndexOf('.')) : '.jpg'
        const up = await wx.cloud.uploadFile({
          cloudPath: `customer-avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`,
          filePath: avatarUrl
        })
        uploadedAvatarFileID = up.fileID
        avatarUrl = up.fileID
      }

      await callCustomer('register.complete', {
        token: this.data.token,
        phoneCode: this.data.phoneCode,
        wxNickName: this.data.wxNickName,
        avatarUrl
      })

      await applySessionToApp(app)
      clearSessionDirty(app)
      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => {
        wx.reLaunch({ url: CUSTOMER_HOME })
      }, 400)
    } catch (e) {
      if (uploadedAvatarFileID) {
        const { deleteCloudFileSafe } = require('../../utils/cloudFileCleanup')
        await deleteCloudFileSafe(uploadedAvatarFileID)
      }
      wx.showToast({ title: e.message || '注册失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
