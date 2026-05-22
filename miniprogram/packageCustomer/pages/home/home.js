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
const { buildCheckinQrPayload } = require('../../../utils/checkinQr')
const { fetchStyleTemplates } = require('../../../config/styles')

Page({
  behaviors: [require('../../../behaviors/customerPageNav')],

  data: {
    customer: null,
    displayName: '',
    storeName: '',
    totalCheckins: 0,
    equityAlbum: 0,
    equityFrame: 0,
    checkinQrPayload: '',
    checkinQrReady: false,
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
    const checkinQrPayload =
      data.qrPayload || buildCheckinQrPayload(data, app.globalData.openId)
    const checkinQrReady = !!checkinQrPayload
    const checkinQrFileId = (data.checkinQrFileId || '').trim()
    this.setData({
      customer: data,
      displayName: getCustomerWxDisplayName(data),
      storeName: data.storeName || '',
      totalCheckins: data.totalCheckins || 0,
      equityAlbum: data.equityAlbum != null ? data.equityAlbum : 0,
      equityFrame: data.equityFrame != null ? data.equityFrame : 0,
      checkinQrPayload,
      checkinQrReady,
      checkinQrFileId,
      codeWarn: checkinQrReady
        ? checkinQrFileId
          ? ''
          : '打卡码生成中，请稍后下拉刷新'
        : '未检测到有效手机号，无法生成打卡码，请到「我的」重新授权手机号或联系门店'
    })
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
        codeWarn:
          msg.indexOf('手机号') >= 0
            ? `${msg}，无法生成打卡码`
            : '未检测到有效手机号，无法生成打卡码，请完成注册或到「我的」授权手机号'
      })
      wx.showToast({ title: msg, icon: 'none' })
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
