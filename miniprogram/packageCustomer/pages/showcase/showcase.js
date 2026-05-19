const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { fetchStyleTemplates } = require('../../../config/styles')

Page({
  data: { templates: [] },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    this.loadTemplates()
  },

  async loadTemplates() {
    try {
      const db = wx.cloud.database()
      const templates = await fetchStyleTemplates(db, { limit: 20 })
      this.setData({ templates })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  previewTemplate(e) {
    const index = e.currentTarget.dataset.index
    const urls = this.data.templates
      .map((t) => t.sampleDisplayUrl || t.sampleFileId)
      .filter(Boolean)
    if (!urls.length) return
    wx.previewImage({ urls, current: urls[index] || urls[0] })
  }
})
