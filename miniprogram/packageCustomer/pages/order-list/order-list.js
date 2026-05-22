const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')

Page({
  behaviors: [require('../../../behaviors/customerPageNav')],

  data: { orders: [] },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    this.loadOrders()
  },

  async loadOrders() {
    try {
      const { list } = await callCustomer('orders.list')
      const orders = (list || []).map((o) => ({
        ...o,
        createTimeStr: this.formatTime(o.createTime)
      }))
      this.setData({ orders })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  formatTime(date) {
    if (!date) return ''
    const d = new Date(date)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageCustomer/pages/order-detail/order-detail?orderId=${id}`
    })
  }
})
