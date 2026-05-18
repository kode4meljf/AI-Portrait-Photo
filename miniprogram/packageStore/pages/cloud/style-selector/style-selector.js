const {
  fetchStyleTemplates,
  pickStyles
} = require('../../../../config/styles.js')
const { STYLE_TEMPLATES_COLLECTION } = require('../../../../config/constants.js')

const db = wx.cloud.database()
const { buildShootQuery } = require('../../../../utils/shootContext.js')

Page({
  data: {
    originalUrl: '',
    count: 3,
    stylePool: [],
    styles: [],
    currentIndex: 0,
    currentStyleName: '',
    loadingStyles: false,
    stylesError: ''
  },

  onLoad(options) {
    const originalUrl = decodeURIComponent(options.originalUrl || '')
    const count = Number(options.count || 3) === 9 ? 9 : 3
    this.setData({ originalUrl, count })
    this.loadStyles(count)
  },

  onShow() {
    const changedUrl = wx.getStorageSync('changedOriginalUrl')
    const changedCount = Number(wx.getStorageSync('changedStyleCount') || 0)
    const nextData = {}

    if (changedUrl) {
      nextData.originalUrl = changedUrl
      wx.removeStorageSync('changedOriginalUrl')
    }

    if (changedCount === 3 || changedCount === 9) {
      nextData.count = changedCount
      wx.removeStorageSync('changedStyleCount')
      if (Object.keys(nextData).length) this.setData(nextData)
      this.loadStyles(changedCount)
      return
    }

    if (Object.keys(nextData).length) {
      this.setData(nextData)
    }
    this.updateNavTitle(this.data.currentStyleName)
  },

  async loadStyles(count) {
    this.setData({ loadingStyles: true, stylesError: '' })
    try {
      const pool = await fetchStyleTemplates(db, {
        collection: STYLE_TEMPLATES_COLLECTION,
        limit: 20,
        onlyEnabled: true
      })
      if (!pool.length) {
        this.setData({
          stylePool: [],
          styles: [],
          currentIndex: 0,
          currentStyleName: '',
          stylesError: '暂无可用风格，请联系管理员配置'
        })
        wx.showToast({ title: '暂无可用风格', icon: 'none' })
        return
      }

      const styles = pickStyles(pool, count)
      let nextIndex = this.data.currentIndex
      if (nextIndex >= styles.length) nextIndex = 0
      const currentStyleName = styles[nextIndex]?.name || ''
      this.setData({
        stylePool: pool,
        styles,
        currentIndex: nextIndex,
        currentStyleName,
        stylesError: ''
      })
      this.updateNavTitle(currentStyleName)
    } catch (err) {
      console.error('[style-selector] 加载风格失败', err)
      this.setData({
        stylePool: [],
        styles: [],
        stylesError: '加载风格失败，请检查网络后重试'
      })
      wx.showToast({ title: '加载风格失败', icon: 'none' })
    } finally {
      this.setData({ loadingStyles: false })
    }
  },

  updateNavTitle(styleName) {
    wx.setNavigationBarTitle({
      title: styleName || '风格选择'
    })
  },

  switchCount(e) {
    const count = Number(e.currentTarget.dataset.count || 3)
    if (count === this.data.count) return
    this.setData({ count })
    this.loadStyles(count)
  },

  onThumbTap(e) {
    const index = Number(e.currentTarget.dataset.index || 0)
    const style = this.data.styles[index]
    if (!style) return
    this.setData({
      currentIndex: index,
      currentStyleName: style.name
    })
    this.updateNavTitle(style.name)
  },

  onSwiperChange(e) {
    const index = Number(e.detail.current || 0)
    const style = this.data.styles[index]
    if (!style) return
    this.setData({
      currentIndex: index,
      currentStyleName: style.name
    })
    this.updateNavTitle(style.name)
  },

  onChangeOriginal() {
    const qs = buildShootQuery({
      originalUrl: this.data.originalUrl || '',
      count: this.data.count
    })
    wx.navigateTo({
      url: `/packageStore/pages/cloud/change-original/change-original?${qs}`
    })
  },

  onStartGenerate() {
    if (!this.data.originalUrl) {
      wx.showToast({ title: '请先选择原图', icon: 'none' })
      return
    }
    if (!this.data.styles.length) {
      wx.showToast({ title: '风格未加载完成', icon: 'none' })
      return
    }
    const styleIds = this.data.styles.map((s) => s.id).join(',')
    const qs = buildShootQuery({
      originalUrl: this.data.originalUrl,
      count: this.data.count,
      styleIds
    })
    wx.navigateTo({
      url: `/packageStore/pages/cloud/generate-result/generate-result?${qs}`
    })
  }
})
