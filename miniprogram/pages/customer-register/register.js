const app = getApp()
const { callCustomer } = require('../../utils/customerApi')
const { applySessionToApp } = require('../../utils/storeSession')

const CUSTOMER_HOME = '/packageCustomer/pages/home/home'

Page({
  data: {
    token: '',
    loading: true,
    submitting: false,
    storeName: '',
    avatarUrl: '',
    wxNickName: '',
    phoneReady: false,
    phoneCode: ''
  },

  onLoad(options) {
    const token = (options.token || '').trim()
    if (!token) {
      wx.showToast({ title: '注册链接无效', icon: 'none' })
      this.setData({ loading: false })
      return
    }
    this.setData({ token })
    this.loadPreview()
  },

  async loadPreview() {
    this.setData({ loading: true })
    try {
      const data = await callCustomer('register.preview', { token: this.data.token })
      this.setData({ storeName: data.storeName || '', loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showModal({
        title: '无法注册',
        content: e.message || '链接无效',
        showCancel: false,
        success: () => wx.navigateBack({ fail: () => {} })
      })
    }
  },

  onChooseAvatar(e) {
    const url = e.detail.avatarUrl || ''
    if (url) this.setData({ avatarUrl: url })
  },

  onNicknameInput(e) {
    this.setData({ wxNickName: (e.detail.value || '').trim() })
  },

  onGetPhoneNumber(e) {
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
    if (this.data.submitting) return
    if (!this.data.phoneReady || !this.data.phoneCode) {
      wx.showToast({ title: '请先授权手机号', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
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
        avatarUrl = up.fileID
      }

      await callCustomer('register.complete', {
        token: this.data.token,
        phoneCode: this.data.phoneCode,
        wxNickName: this.data.wxNickName,
        avatarUrl
      })

      await applySessionToApp(app)
      wx.showToast({ title: '注册成功', icon: 'success' })
      setTimeout(() => {
        wx.reLaunch({ url: CUSTOMER_HOME })
      }, 400)
    } catch (e) {
      wx.showToast({ title: e.message || '注册失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
