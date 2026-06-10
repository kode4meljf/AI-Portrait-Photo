const {
  fetchStyleTemplates,
  pickStyles
} = require('../../../../config/styles.js')
const { STYLE_TEMPLATES_COLLECTION } = require('../../../../config/constants.js')
const { getCustomerDisplayName, compactDisplayName } = require('../../../../utils/customerDisplay')
const { GENDER_MALE, GENDER_FEMALE } = require('../../../../utils/customerGender')
const {
  filterStylesByGender,
  styleGenderFromCustomer
} = require('../../../../utils/styleGender')

const db = wx.cloud.database()
const { buildShootQuery, setPendingShoot, getShootCustomerId } = require('../../../../utils/shootContext.js')
const { portraitCostForCount, assertPortraitBalance } = require('../../../../utils/portraitBilling.js')

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
    submitShowCost: true,
    submitCost: 10,
    submitPlainText: '立即生成',
    hasLinkedCustomer: false,
    showGenderToggle: false,
    filterCompactName: '',
    filterGenderLabel: '',
    manualGender: GENDER_MALE
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

    if (this.data.stylePool.length) {
      this.applyGenderFilter(this.data.count, this.data.stylePool)
    } else {
      this.updateNavTitle(this.data.currentStyleName)
    }
  },

  resolveGenderFilter() {
    const app = getApp()
    const customerId = getShootCustomerId(app)
    const customer = app.globalData.selectedCustomer
    if (customerId && customer && customer._id === customerId) {
      const genderLabel = styleGenderFromCustomer(customer.gender)
      return {
        hasLinkedCustomer: true,
        genderLabel,
        compactName: compactDisplayName(getCustomerDisplayName(customer))
      }
    }
    const manualGender = this.data.manualGender === GENDER_FEMALE ? GENDER_FEMALE : GENDER_MALE
    return {
      hasLinkedCustomer: false,
      genderLabel: styleGenderFromCustomer(manualGender),
      compactName: ''
    }
  },

  getFilteredPool(pool) {
    const { genderLabel } = this.resolveGenderFilter()
    return filterStylesByGender(pool, genderLabel)
  },

  applyGenderFilter(count, pool) {
    const filterState = this.resolveGenderFilter()
    const filtered = filterStylesByGender(pool, filterState.genderLabel)
    const styles = pickStyles(filtered, count)
    let nextIndex = this.data.currentIndex
    if (nextIndex >= styles.length) nextIndex = 0
    const currentStyleName = styles[nextIndex]?.name || ''

    let stylesError = ''
    if (!pool.length) {
      stylesError = '暂无可用风格，请联系管理员配置'
    } else if (!filtered.length) {
      stylesError = filterState.hasLinkedCustomer
        ? '该客户性别暂无可用风格'
        : '该性别暂无可用风格'
    }

    this.syncSubmitState({
      stylePool: pool,
      styles,
      currentIndex: nextIndex,
      currentStyleName,
      stylesError,
      hasLinkedCustomer: filterState.hasLinkedCustomer,
      showGenderToggle: !filterState.hasLinkedCustomer,
      filterCompactName: filterState.compactName,
      filterGenderLabel: filterState.genderLabel,
      loadingStyles: false
    })
    this.updateNavTitle(currentStyleName)
  },

  syncSubmitState(extra = {}) {
    const merged = { ...this.data, ...extra }
    const { loadingStyles, styles, originalUrl, count } = merged
    const canSubmit = !!originalUrl && !loadingStyles && styles.length > 0
    const styleCount = count === 9 ? 9 : 3
    let submitShowCost = true
    let submitPlainText = '立即生成'
    let submitCost = portraitCostForCount(styleCount)
    if (loadingStyles) {
      submitShowCost = false
      submitPlainText = styles.length ? '风格切换中' : '加载风格中'
    } else if (!styles.length) {
      submitCost = portraitCostForCount(3)
    }
    this.setData({ canSubmit, submitShowCost, submitPlainText, submitCost, ...extra })
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
        this.applyGenderFilter(count, [])
        wx.showToast({ title: '暂无可用风格', icon: 'none' })
        return
      }
      this.applyGenderFilter(count, pool)
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
    if (this.data.stylePool.length) {
      this.applyGenderFilter(count, this.data.stylePool)
    } else {
      this.loadStyles(count)
    }
  },

  onGenderFilterTap(e) {
    const gender = e.currentTarget.dataset.gender
    if (!gender || gender === this.data.manualGender) return
    this.setData({ manualGender: gender, currentIndex: 0 })
    if (this.data.stylePool.length) {
      this.applyGenderFilter(this.data.count, this.data.stylePool)
    }
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

  async onStartGenerate() {
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
    try {
      await assertPortraitBalance(count)
    } catch (e) {
      return
    }
    const filtered = this.getFilteredPool(pool)
    const styles = pickStyles(filtered, count)
    if (!styles.length) {
      wx.showToast({ title: '该性别暂无可用风格', icon: 'none' })
      return
    }
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
      url: `/packageStore/pages/cloud/portrait-viewer/portrait-viewer?mode=live&${qs}`
    })
  }
})
