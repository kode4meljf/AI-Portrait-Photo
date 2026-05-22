const app = getApp()
const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')
const { getCustomerWxDisplayName } = require('../../../utils/customerDisplay')
const { buildCheckinQrPayload } = require('../../../utils/checkinQr')
const { fetchStyleTemplates } = require('../../../config/styles')

Page({
  data: {
    customer: null,
    displayName: '',
    storeName: '',
    totalCheckins: 0,
    equityAlbum: 0,
    equityFrame: 0,
    checkinQrPayload: '',
    checkinQrReady: false,
    checkinQrUrl: '',
    previewTemplates: []
  },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    await Promise.all([this.loadProfile(), this.loadPreviewTemplates()])
  },

  async loadProfile() {
    try {
      const data = await callCustomer('profile.get')
      app.globalData.customer = data
      const checkinQrPayload =
        data.qrPayload || buildCheckinQrPayload(data, app.globalData.openId)
      const checkinQrReady = !!checkinQrPayload

      this.setData({
        customer: data,
        displayName: getCustomerWxDisplayName(data),
        storeName: data.storeName || '',
        totalCheckins: data.totalCheckins || 0,
        equityAlbum: data.equityAlbum != null ? data.equityAlbum : 0,
        equityFrame: data.equityFrame != null ? data.equityFrame : 0,
        checkinQrPayload,
        checkinQrReady,
        checkinQrUrl: ''
      })

      if (checkinQrReady) {
        await this.loadCheckinQrImage()
      }
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async loadCheckinQrImage() {
    try {
      const res = await callCustomer('profile.checkinQrImage')
      if (res && res.tempFileURL) {
        this.setData({ checkinQrUrl: res.tempFileURL })
      }
    } catch (e) {
      console.warn('[home] checkinQrImage', e)
    }
  },

  async loadPreviewTemplates() {
    try {
      const db = wx.cloud.database()
      const templates = await fetchStyleTemplates(db, { limit: 4 })
      this.setData({ previewTemplates: templates })
    } catch (e) {
      console.warn('[home] preview templates', e)
    }
  },

  goShowcase() {
    wx.navigateTo({ url: '/packageCustomer/pages/showcase/showcase' })
  },

  onPreviewSample(e) {
    const index = e.currentTarget.dataset.index
    const urls = this.data.previewTemplates
      .map((t) => t.sampleDisplayUrl || t.sampleFileId)
      .filter(Boolean)
    if (!urls.length) return
    wx.previewImage({ urls, current: urls[index] || urls[0] })
  }
})
