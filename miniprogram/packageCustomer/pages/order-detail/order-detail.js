const app = getApp()
const { ensureCustomerPage } = require('../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')
const { buildFrameOrderView, PLACEHOLDER_THUMB, shouldQueryLogistics } = require('../../utils/frameOrderDetailView')

Page({
  behaviors: [require('../../behaviors/customerPageNav')],

  data: {
    orderId: '',
    scrollIntoView: '',
    loading: true,
    view: null
  },

  _orderRaw: null,
  _viewOptions: null,

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

  buildView(order, extra = {}) {
    return buildFrameOrderView(order, {
      ...(this._viewOptions || {}),
      ...extra
    })
  },

  async loadOrderDetail(skipLogistics = false) {
    this.setData({ loading: true })
    try {
      const { order } = await callCustomer('orders.get', { orderId: this.data.orderId })
      const storeName = app.globalData.customer?.storeName || '所属门店'
      this._orderRaw = order
      this._viewOptions = {
        isStoreStaff: false,
        audience: 'customer',
        storeName
      }
      const view = this.buildView(order)
      this.setData({ view, loading: false })
      if (!skipLogistics && shouldQueryLogistics(order)) {
        this.loadLogistics(false)
      }
    } catch (e) {
      this.setData({ loading: false, view: null })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async loadLogistics(force = false) {
    if (!this._orderRaw || !shouldQueryLogistics(this._orderRaw)) return
    this.setData({ view: this.buildView(this._orderRaw, { logisticsLoading: true }) })
    try {
      const { logistics } = await callCustomer('orders.logistics', {
        orderId: this.data.orderId,
        force
      })
      if (logistics?.companyName) {
        this._orderRaw = {
          ...this._orderRaw,
          shippingCompanyName: logistics.companyName,
          shippingCom: logistics.companyCode || this._orderRaw.shippingCom
        }
      }
      this.setData({ view: this.buildView(this._orderRaw, { logistics }) })
    } catch (e) {
      console.warn('查询物流失败:', e)
      this.setData({
        view: this.buildView(this._orderRaw, {
          logistics: {
            empty: true,
            message: e.message || '物流信息查询失败，请稍后重试',
            traces: []
          }
        })
      })
    }
  },

  onPullDownRefresh() {
    this.loadOrderDetail(true)
      .then(() => {
        if (this._orderRaw && shouldQueryLogistics(this._orderRaw)) {
          return this.loadLogistics(true)
        }
      })
      .finally(() => wx.stopPullDownRefresh())
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
