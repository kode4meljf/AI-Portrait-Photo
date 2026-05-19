const app = getApp()
const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')
const { getCustomerWxDisplayName } = require('../../../utils/customerDisplay')
const { buildCheckinQrPayload } = require('../../../utils/checkinQr')

Page({
  data: {
    customer: null,
    displayName: '',
    customerId: '',
    storeName: '',
    checkinQrPayload: '',
    wxNickName: ''
  },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    await this.loadProfile()
  },

  async loadProfile() {
    try {
      const data = await callCustomer('profile.get')
      app.globalData.customer = data
      this.setData({
        customer: data,
        displayName: getCustomerWxDisplayName(data),
        wxNickName: data.wxNickName || '',
        customerId: data.customerId,
        storeName: data.storeName || '',
        checkinQrPayload: data.qrPayload || buildCheckinQrPayload(data, app.globalData.openId)
      })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  goShowcase() {
    wx.navigateTo({ url: '/packageCustomer/pages/showcase/showcase' })
  },

  onCopyId() {
    const id = this.data.customerId
    if (!id) return
    wx.setClipboardData({
      data: id,
      success: () => wx.showToast({ title: '已复制顾客码', icon: 'success' })
    })
  },

  /** 到店打卡前同步当前微信昵称（写入库并刷新扫码内容） */
  async onSyncWxNick(e) {
    const wxNickName = (e.detail.value || '').trim()
    if (!wxNickName) return
    try {
      const profile = await callCustomer('profile.syncWx', { wxNickName })
      app.globalData.customer = profile
      this.setData({
        customer: profile,
        displayName: getCustomerWxDisplayName(profile),
        wxNickName: profile.wxNickName || '',
        checkinQrPayload: buildCheckinQrPayload(profile, app.globalData.openId)
      })
      wx.showToast({ title: '昵称已同步', icon: 'success' })
    } catch (err) {
      wx.showToast({ title: err.message || '同步失败', icon: 'none' })
    }
  },

  onCopyCheckinPayload() {
    const payload = this.data.checkinQrPayload
    if (!payload) return
    wx.setClipboardData({
      data: payload,
      success: () => wx.showToast({ title: '已复制打卡码内容', icon: 'success' })
    })
  }
})
