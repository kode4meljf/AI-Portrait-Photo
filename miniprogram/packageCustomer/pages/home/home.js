const app = getApp()
const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { applySessionToApp } = require('../../../utils/storeSession')
const {
  activateFromOptions,
  isDevCustomerPreview,
  getMockCustomerProfile
} = require('../../../utils/devCustomerPreview')
const { callCustomer } = require('../../../utils/customerApi')
const { getCustomerWxDisplayName } = require('../../../utils/customerDisplay')
const { fetchStyleTemplates } = require('../../../config/styles')

const QR_UNAVAILABLE_HINT = '暂无法显示打卡码，请联系店长协助处理'

Page({
  behaviors: [require('../../../behaviors/customerPageNav')],

  data: {
    customer: null,
    displayName: '',
    storeName: '',
    totalCheckins: 0,
    equityAlbum: 0,
    equityFrame: 0,
    checkinQrFileId: '',
    codeWarn: '',
    previewTemplates: []
  },

  onLoad(options) {
    activateFromOptions(options || {})
  },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    if (isDevCustomerPreview()) {
      const account = await applySessionToApp(app)
      if (account.accountKind !== 'customer') {
        wx.showToast({ title: '开发预览（模拟顾客）', icon: 'none', duration: 2000 })
      }
    }
    await Promise.all([this.loadProfile(), this.loadPreviewTemplates()])
  },

  applyProfileData(data) {
    app.globalData.customer = data
    const checkinQrFileId = (data.checkinQrFileId || '').trim()
    this.setData({
      customer: data,
      displayName: getCustomerWxDisplayName(data),
      storeName: data.storeName || '',
      totalCheckins: data.totalCheckins || 0,
      equityAlbum: data.equityAlbum != null ? data.equityAlbum : 0,
      equityFrame: data.equityFrame != null ? data.equityFrame : 0,
      checkinQrFileId,
      codeWarn: checkinQrFileId ? '' : QR_UNAVAILABLE_HINT
    })
    this._lastProfileError = ''
  },

  async loadProfile() {
    try {
      if (isDevCustomerPreview()) {
        const account = await applySessionToApp(app)
        if (account.accountKind !== 'customer') {
          this.applyProfileData(getMockCustomerProfile())
          return
        }
      }
      const data = await callCustomer('profile.get')
      this.applyProfileData(data)
    } catch (e) {
      if (isDevCustomerPreview()) {
        this.applyProfileData(getMockCustomerProfile())
        wx.showToast({ title: '开发预览（档案无手机号，已用模拟数据）', icon: 'none' })
        return
      }
      const msg = e.message || '加载失败'
      this.setData({
        checkinQrFileId: '',
        codeWarn: QR_UNAVAILABLE_HINT
      })
      if (msg !== this._lastProfileError) {
        this._lastProfileError = msg
        wx.showToast({ title: msg, icon: 'none' })
      }
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
    const index = e.detail && e.detail.index != null ? e.detail.index : e.currentTarget.dataset.index
    const urls = this.data.previewTemplates
      .map((t) => t.sampleDisplayUrl || t.sampleFileId)
      .filter(Boolean)
    if (!urls.length) return
    wx.previewImage({ urls, current: urls[index] || urls[0] })
  }
})
