const app = getApp()
const { ensureCustomerPage } = require('../../utils/customerGuard')

Page({
  behaviors: [require('../../behaviors/customerPageNav')],

  data: { batches: [] },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    this.loadBatches()
  },

  async loadBatches() {
    const customerDocId = app.globalData.customerDocId
    if (!customerDocId) return
    try {
      const db = wx.cloud.database()
      const res = await db
        .collection('batches')
        .where({ customerId: customerDocId })
        .orderBy('createTime', 'desc')
        .limit(30)
        .get()
      this.setData({ batches: res.data || [] })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  previewBatch(e) {
    const url = e.currentTarget.dataset.url
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  }
})
