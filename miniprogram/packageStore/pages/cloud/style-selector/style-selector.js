const {
  fetchStyleTemplates,
  pickStyles
} = require('../../../../config/styles.js')
const { STYLE_TEMPLATES_COLLECTION } = require('../../../../config/constants.js')

const db = wx.cloud.database()
const { buildShootQuery, setPendingShoot } = require('../../../../utils/shootContext.js')
const { portraitCostForCount } = require('../../../../utils/portraitBilling.js')

Page({
  data: {
    originalUrl: '',
    count: 3,
    stylePool: [],
    styles: [],
    currentIndex: 0,
    currentStyleName: '',
    loadingStyles: false,
    stylesError: '',
    canSubmit: false,
    submitBtnText: '立即生成 · 耗3次'
  },

  onLoad(options) {
    const originalUrl = decodeURIComponent(options.originalUrl || '')
    const count = Number(options.count || 3) === 9 ? 9 : 3
    this.syncSubmitState({ originalUrl, count })
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
      if (Object.keys(nextData).length) this.syncSubmitState(nextData)
      this.loadStyles(changedCount)
      return
    }

    if (Object.keys(nextData).length) {
      this.syncSubmitState(nextData)
    }
    this.updateNavTitle(this.data.currentStyleName)
  },

  syncSubmitState(extra = {}) {
    const merged = { ...this.data, ...extra }
    const { loadingStyles, styles, originalUrl, count } = merged
    const canSubmit = !!originalUrl && !loadingStyles && styles.length > 0
    const styleCount = count === 9 ? 9 : 3
    let submitBtnText = `立即生成 · 耗${portraitCostForCount(styleCount)}次`
    if (loadingStyles) {
      submitBtnText = styles.length ? '风格切换中' : '加载风格中'
    } else if (!styles.length) {
      submitBtnText = '立即生成 · 耗1次'
    }
    this.setData({ canSubmit, submitBtnText, ...extra })
  },

  async loadStyles(count) {
    this.syncSubmitState({ loadingStyles: true, stylesError: '' })
    try {
      const pool = await fetchStyleTemplates(db, {
        collection: STYLE_TEMPLATES_COLLECTION,
        limit: 20,
        onlyEnabled: true
      })
      if (!pool.length) {
        this.syncSubmitState({
          stylePool: [],
          styles: [],
          currentIndex: 0,
          currentStyleName: '',
          stylesError: '暂无可用风格，请联系管理员配置',
          loadingStyles: false
        })
        wx.showToast({ title: '暂无可用风格', icon: 'none' })
        return
      }

      const styles = pickStyles(pool, count)
      let nextIndex = this.data.currentIndex
      if (nextIndex >= styles.length) nextIndex = 0
      const currentStyleName = styles[nextIndex]?.name || ''
      this.syncSubmitState({
        stylePool: pool,
        styles,
        currentIndex: nextIndex,
        currentStyleName,
        stylesError: '',
        loadingStyles: false
      })
      this.updateNavTitle(currentStyleName)
    } catch (err) {
      console.error('[style-selector] 加载风格失败', err)
      this.syncSubmitState({
        stylePool: [],
        styles: [],
        stylesError: '加载风格失败，请检查网络后重试',
        loadingStyles: false
      })
      wx.showToast({ title: '加载风格失败', icon: 'none' })
    } finally {
      if (this.data.loadingStyles) {
        this.syncSubmitState({ loadingStyles: false })
      }
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
    if (!this.data.canSubmit) return
    const pool = this.data.stylePool
    if (!pool.length) {
      wx.showToast({ title: '风格未加载完成', icon: 'none' })
      return
    }
    const count = this.data.count === 9 ? 9 : 3
    const styles = pickStyles(pool, count)
    setPendingShoot({
      count,
      styles,
      originalUrl: this.data.originalUrl
    })
    const qs = buildShootQuery({
      count,
      originalUrl: this.data.originalUrl
    })
    wx.navigateTo({
      url: `/packageStore/pages/cloud/generate-result/generate-result?${qs}`
    })
  }
})
