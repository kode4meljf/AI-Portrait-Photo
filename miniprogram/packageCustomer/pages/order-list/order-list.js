const app = getApp()
const { ensureCustomerPage } = require('../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')
const { parseCloudDate } = require('../../../utils/cloudDate')
const {
  formatCustomerOrderRow,
  calcOrderSummary
} = require('../../utils/customerOrderListDisplay')

const CACHE_STORAGE_KEY = 'customer_orders_list_v1'
const CACHE_TTL_MS = 5 * 60 * 1000

Page({
  behaviors: [require('../../behaviors/customerPageNav')],

  data: {
    orders: [],
    summary: { total: 0, pending: 0, producing: 0, shipped: 0, done: 0 },
    storeName: '',
    showSkeleton: true,
    refreshing: false,
    emptyHint: '暂无订单',
    skeletonRows: [0, 1, 2]
  },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return

    const cached = this.readCache()
    if (cached) {
      this.applyPayload(cached)
      this.setData({ showSkeleton: false })
      await this.loadOrders({ background: true })
      return
    }

    this.setData({ showSkeleton: true, orders: [] })
    await this.loadOrders()
  },

  onPullDownRefresh() {
    this.loadOrders({ force: true }).finally(() => wx.stopPullDownRefresh())
  },

  formatTime(date) {
    const d = parseCloudDate(date)
    if (!d) return ''
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },

  readCache() {
    const mem = app.globalData._customerOrdersCache
    if (mem && Date.now() - mem.at < CACHE_TTL_MS) return mem.payload
    try {
      const raw = wx.getStorageSync(CACHE_STORAGE_KEY)
      if (!raw || !raw.at || Date.now() - raw.at >= CACHE_TTL_MS) return null
      app.globalData._customerOrdersCache = raw
      return raw.payload
    } catch (e) {
      return null
    }
  },

  writeCache(payload) {
    const entry = { at: Date.now(), payload }
    app.globalData._customerOrdersCache = entry
    try {
      wx.setStorageSync(CACHE_STORAGE_KEY, entry)
    } catch (e) {
      /* ignore */
    }
  },

  applyPayload({ list, storeName }) {
    const formatTime = (d) => this.formatTime(d)
    const orders = (list || []).map((o) => formatCustomerOrderRow(o, formatTime))
    const name =
      (storeName || '').trim() ||
      (app.globalData.customer && app.globalData.customer.storeName) ||
      '所属门店'
    this.setData({
      storeName: name,
      orders,
      summary: calcOrderSummary(orders),
      emptyHint: orders.length
        ? ''
        : '暂无与您关联的摆台订单。请确认门店下单时已关联您的客户档案。'
    })
  },

  async loadOrders(options = {}) {
    const { background = false, force = false } = options
    if (this._loadingOrders) return
    this._loadingOrders = true

    if (!background) {
      if (force && this.data.orders.length) {
        this.setData({ refreshing: true })
      } else if (!this.data.orders.length) {
        this.setData({ showSkeleton: true })
      }
    }

    try {
      const data = await callCustomer('orders.list')
      const storeName =
        (data.storeName || '').trim() ||
        (app.globalData.customer && app.globalData.customer.storeName) ||
        ''
      if (storeName && app.globalData.customer) {
        app.globalData.customer = { ...app.globalData.customer, storeName }
      }
      const payload = { list: data.list || [], storeName }
      this.writeCache(payload)
      this.applyPayload(payload)
    } catch (e) {
      if (!background) {
        wx.showToast({ title: e.message || '加载失败', icon: 'none' })
        if (!this.data.orders.length) {
          this.setData({
            emptyHint: '加载失败，请下拉重试'
          })
        }
      }
    } finally {
      this._loadingOrders = false
      this.setData({ showSkeleton: false, refreshing: false })
    }
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/packageCustomer/pages/order-detail/order-detail?orderId=${id}`
    })
  }
})
