const app = getApp()
const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')
const { getCustomerWxDisplayName } = require('../../../utils/customerDisplay')

Page({
  data: {
    profile: null,
    wxNickName: '微信用户',
    phone: '',
    storeName: ''
  },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    await this.loadProfile()
  },

  async loadProfile() {
    try {
      const profile = await callCustomer('profile.get')
      app.globalData.customer = profile
      this.setData({
        profile,
        wxNickName: getCustomerWxDisplayName(profile),
        phone: profile.phone || '',
        storeName: profile.storeName || ''
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onChooseAvatar(e) {
    const url = e.detail.avatarUrl
    if (!url) return
    this.setData({ 'profile.avatarUrl': url })
    this.uploadAvatarAndSave(url)
  },

  async uploadAvatarAndSave(tempPath) {
    wx.showLoading({ title: '保存中' })
    try {
      const ext = (tempPath.match(/\.(\w+)$/) || [])[1] || 'jpg'
      const cloudPath = `customer-avatars/${app.globalData.customerDocId || 'me'}_${Date.now()}.${ext}`
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
      const profile = await callCustomer('profile.update', { avatarUrl: up.fileID })
      app.globalData.customer = profile
      this.setData({ profile })
      wx.showToast({ title: '已更新', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async onChangePhone(e) {
    const phoneCode = e.detail.code
    if (!phoneCode) return
    wx.showLoading({ title: '更新中' })
    try {
      const profile = await callCustomer('profile.update', { phoneCode })
      app.globalData.customer = profile
      this.setData({ profile, phone: profile.phone || '' })
      wx.showToast({ title: '手机号已更新', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '授权失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})
