const { ensureCustomerPage } = require('../../utils/customerGuard')
const { callCustomer } = require('../../../utils/customerApi')

Page({
  behaviors: [require('../../behaviors/customerPageNav'), require('../../../behaviors/pageShare')],

  data: {
    photos: [],
    loading: true,
    loadingMore: false,
    hasMore: true,
    loadError: ''
  },

  _cursor: { dbSkip: 0 },
  _loaded: false,
  _returnFromPreview: false,

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    if (this._returnFromPreview) {
      this._returnFromPreview = false
      return
    }
    if (!this._loaded) {
      this._loaded = true
      await this.loadFirstPage()
    }
  },

  async loadFirstPage() {
    this._cursor = { dbSkip: 0 }
    this.setData({
      loading: true,
      loadingMore: false,
      hasMore: true,
      loadError: '',
      photos: []
    })
    try {
      const res = await this.fetchPage(true)
      this.setData({
        photos: res.list || [],
        hasMore: !!res.hasMore,
        loading: false
      })
    } catch (e) {
      console.error('[customer-gallery] load failed', e)
      this.setData({
        loading: false,
        loadError: e.message || '加载失败'
      })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  async fetchPage(reset) {
    if (reset) this._cursor = { dbSkip: 0 }
    const res = await callCustomer('gallery.list', {
      dbSkip: this._cursor.dbSkip,
      pageSize: 30
    })
    this._cursor = res.cursor || { dbSkip: 0 }
    return res
  },

  async onLoadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return
    this.setData({ loadingMore: true })
    try {
      const res = await this.fetchPage(false)
      this.setData({
        photos: this.data.photos.concat(res.list || []),
        hasMore: !!res.hasMore,
        loadingMore: false
      })
    } catch (e) {
      console.error('[customer-gallery] loadMore failed', e)
      this.setData({ loadingMore: false })
      wx.showToast({ title: e.message || '加载更多失败', icon: 'none' })
    }
  },

  previewPhoto(e) {
    const index = Number(e.currentTarget.dataset.index)
    const urls = this.data.photos.map((p) => p.url).filter(Boolean)
    const current = urls[index]
    if (!current) {
      wx.showToast({ title: '暂无成片', icon: 'none' })
      return
    }
    this._returnFromPreview = true
    wx.previewImage({ urls, current })
  }
})
