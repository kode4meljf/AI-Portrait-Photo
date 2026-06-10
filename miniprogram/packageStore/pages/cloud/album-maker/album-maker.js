const app = getApp()
const { callOrderApi } = require('../../../../utils/orderApi')
const { isValidStoreId } = require('../../../../utils/storeSession')
const { fetchAlbumPlatformConfig } = require('../../../../utils/platformSettings')
const { DEFAULTS } = require('../../../../utils/albumPlatformConfig')
const { loadCustomerAiPhotoPage } = require('../../../utils/albumPhotos')
const {
  assertStorePoints,
  fetchStoreBalance,
  isInsufficientBalanceError,
  promptInsufficientBalance
} = require('../../../../utils/portraitBilling')

const db = wx.cloud.database()

Page({
  data: {
    customerId: '',
    albumSelectMin: DEFAULTS.albumSelectMin,
    albumSelectMax: DEFAULTS.albumSelectMax,
    albumPointsPerPhoto: DEFAULTS.albumPointsPerPhoto,
    photos: [],
    selectedMap: {},
    selectedCount: 0,
    previewUrl: '',
    totalPoints: 0,
    canSubmit: false,
    loading: true,
    loadingMore: false,
    hasMore: true,
    submitting: false,
    loadError: ''
  },

  _cursor: { dbSkip: 0 },
  _overLimitToastAt: 0,

  onLoad(options) {
    const customerId = (options.customerId || '').trim()
    if (!customerId) {
      wx.showToast({ title: '缺少客户信息', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
      return
    }
    this.setData({ customerId })
    this.initAlbumConfig().then(() => this.loadFirstPage())
  },

  async initAlbumConfig() {
    try {
      let album = app.globalData.pendingAlbumPlatformConfig
      if (album) {
        app.globalData.pendingAlbumPlatformConfig = null
      } else {
        album = await fetchAlbumPlatformConfig()
      }
      this.setData({
        albumSelectMin: album.albumSelectMin,
        albumSelectMax: album.albumSelectMax,
        albumPointsPerPhoto: album.albumPointsPerPhoto
      })
      if (this.data.selectedCount > 0) {
        this.syncPhotosSelection({ ...this.data.selectedMap })
      }
    } catch (e) {
      console.error('[album-maker] initAlbumConfig', e)
    }
  },

  async loadFirstPage() {
    this.setData({ loading: true, loadError: '', photos: [], hasMore: true })
    this._cursor = { dbSkip: 0 }
    try {
      const page = await this.fetchPage(true)
      const photos = this.decoratePhotos(page.items, {})
      const previewUrl = photos[0] ? photos[0].url : ''
      this.setData({
        photos,
        previewUrl,
        hasMore: page.hasMore,
        loading: false
      })
    } catch (e) {
      console.error('[album-maker] load', e)
      this.setData({
        loading: false,
        loadError: '加载失败，请返回重试'
      })
    }
  },

  async fetchPage(reset) {
    const storeId = app.globalData.storeId
    if (!isValidStoreId(storeId)) throw new Error('请先登录门店')
    if (reset) this._cursor = { dbSkip: 0 }
    const res = await loadCustomerAiPhotoPage(
      db,
      storeId,
      this.data.customerId,
      this._cursor
    )
    this._cursor = res.cursor
    return res
  },

  decoratePhotos(items, selectedMap) {
    return (items || []).map((item) => ({
      ...item,
      selected: !!selectedMap[item._id]
    }))
  },

  syncPhotosSelection(selectedMap) {
    const { albumSelectMin, albumSelectMax } = this.data
    const photos = this.decoratePhotos(this.data.photos, selectedMap)
    const selectedCount = Object.keys(selectedMap).length
    const totalPoints = selectedCount * this.data.albumPointsPerPhoto
    const canSubmit =
      selectedCount >= albumSelectMin && selectedCount <= albumSelectMax
    this.setData({
      photos,
      selectedMap,
      selectedCount,
      totalPoints,
      canSubmit
    })
  },

  onPreviewMain() {
    const url = this.data.previewUrl
    if (!url) return
    const urls = this.data.photos.map((p) => p.url).filter(Boolean)
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url]
    })
  },

  onTogglePhoto(e) {
    const id = e.currentTarget.dataset.id
    const url = e.currentTarget.dataset.url
    if (!id) return

    const selectedMap = { ...this.data.selectedMap }
    if (selectedMap[id]) {
      delete selectedMap[id]
      this.syncPhotosSelection(selectedMap)
      return
    }

    const count = Object.keys(selectedMap).length
    const { albumSelectMax } = this.data
    if (count >= albumSelectMax) {
      const now = Date.now()
      if (now - this._overLimitToastAt > 1200) {
        this._overLimitToastAt = now
        wx.showToast({
          title: `最多选择 ${albumSelectMax} 张`,
          icon: 'none'
        })
      }
      return
    }

    selectedMap[id] = true
    if (url) this.setData({ previewUrl: url })
    this.syncPhotosSelection(selectedMap)
  },

  async onLoadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return
    this.setData({ loadingMore: true })
    try {
      const page = await this.fetchPage(false)
      const merged = this.data.photos.concat(
        this.decoratePhotos(page.items, this.data.selectedMap)
      )
      this.setData({
        photos: merged,
        hasMore: page.hasMore,
        loadingMore: false
      })
    } catch (e) {
      console.error('[album-maker] loadMore', e)
      this.setData({ loadingMore: false })
      wx.showToast({ title: '加载更多失败', icon: 'none' })
    }
  },

  getSelectedPayload() {
    const photoIds = []
    const photoUrls = []
    this.data.photos.forEach((p) => {
      if (this.data.selectedMap[p._id]) {
        photoIds.push(p._id)
        photoUrls.push(p.url)
      }
    })
    return { photoIds, photoUrls }
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSubmit) return
    const { selectedCount, totalPoints, customerId, albumSelectMin, albumSelectMax } =
      this.data
    if (selectedCount < albumSelectMin || selectedCount > albumSelectMax) {
      return
    }

    try {
      await assertStorePoints(totalPoints)
    } catch (e) {
      return
    }

    const { photoIds, photoUrls } = this.getSelectedPayload()
    if (photoIds.length !== selectedCount) {
      wx.showToast({ title: '选图数据异常，请重试', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中…', mask: true })
    try {
      await callOrderApi('create', {
        orderType: 'album',
        customerId,
        photoIds,
        photoUrls,
        photoCount: selectedCount,
        pointsCost: totalPoints
      })
      app.globalData.ordersNeedRefresh = true
      wx.hideLoading()
      wx.showToast({ title: '影集订单已提交', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/order-list/order-list' })
      }, 450)
    } catch (err) {
      wx.hideLoading()
      if (isInsufficientBalanceError(err)) {
        await promptInsufficientBalance({
          balance: await fetchStoreBalance(),
          required: totalPoints
        })
      } else {
        wx.showToast({
          title: err.message || '提交失败',
          icon: 'none',
          duration: 2800
        })
      }
    } finally {
      this.setData({ submitting: false })
    }
  }
})
