const app = getApp()
const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')
const { buildFrameOrderView, PLACEHOLDER_THUMB } = require('../../../utils/frameOrderDetailView')

Page({
  behaviors: [require('../../../behaviors/customerPageNav')],

  data: {
    orderId: '',
    scrollIntoView: '',
    loading: true,
    view: null
  },

  onLoad(options) {
    const orderId = options.orderId || ''
    if (!orderId) {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      return
    }
    const scrollIntoView = options.scrollTo === 'logistics' ? 'logistics-anchor' : ''
    this.setData({ orderId, scrollIntoView })
    this.loadOrderDetail()
  },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
  },

  async loadOrderDetail() {
    this.setData({ loading: true })
    try {
      const { order } = await callCustomer('orders.get', { orderId: this.data.orderId })
      const storeName = app.globalData.customer?.storeName || '所属门店'
      this.setData({
        view: buildFrameOrderView(order, {
          isStoreStaff: false,
          audience: 'customer',
          storeName
        }),
        loading: false
      })
    } catch (e) {
      this.setData({ loading: false, view: null })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onPullDownRefresh() {
    this.loadOrderDetail().finally(() => wx.stopPullDownRefresh())
  },

  previewImage() {
    const url = this.data.view?.photoUrl
    if (!url || url === PLACEHOLDER_THUMB) {
      wx.showToast({ title: '暂无成片', icon: 'none' })
      return
    }
    wx.previewImage({ urls: [url], current: url })
  },

  onCopyOrderNo() {
    const no = this.data.view?.orderNo
    if (!no) return
    wx.setClipboardData({
      data: no,
      success: () => wx.showToast({ title: '已复制订单号', icon: 'success' })
    })
  },

  onCopyShippingNo() {
    const no = this.data.view?.shippingNo
    if (!no) {
      wx.showToast({ title: '暂无运单号', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: no,
      success: () => wx.showToast({ title: '已复制运单号', icon: 'success' })
    })
  },

  onScrollToLogistics() {
    this.setData({ scrollIntoView: 'logistics-anchor' })
  },

  onGhostAction() {
    if (this.data.view?.showGhostCopy) {
      this.onCopyShippingNo()
    }
  }
})
