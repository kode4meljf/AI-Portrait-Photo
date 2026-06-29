const {
  fetchStyleTemplates,
  pickStylesForShoot
} = require('../../../../config/styles.js')
const { STYLE_TEMPLATES_COLLECTION } = require('../../../../config/constants.js')
const { getCustomerDisplayName, compactDisplayName } = require('../../../../utils/customerDisplay')
const { GENDER_MALE, GENDER_FEMALE } = require('../../../../utils/customerGender')
const {
  styleGenderFromCustomer
} = require('../../../../utils/styleGender')
const { fetchCustomerUsedStyleIds } = require('../../../utils/customerStyleHistory')

const db = wx.cloud.database()
const { buildShootQuery, setPendingShoot, getShootCustomerId } = require('../../../../utils/shootContext.js')
const { portraitCostForCount, assertPortraitBalance } = require('../../../utils/portraitBilling.js')

Page({
  behaviors: [require('../../../../behaviors/pageShare')],
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
    countHint: '',
    hasLinkedCustomer: false,
    showGenderToggle: false,
    filterCompactName: '',
    filterGenderLabel: '',
    manualGender: GENDER_MALE
  },

  onLoad(options) {
    const originalUrl = decodeURIComponent(options.originalUrl || '')
    const count = Number(options.count || 3) === 9 ? 9 : 3
    this._usedStyleIds = []
    this._historyCustomerId = ''
    this._loadedGenderLabel = ''
    this.syncSubmitState({ originalUrl, count })
    this.loadStyles(count)
  },

  async onShow() {
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

    const filterState = this.resolveGenderFilter()
    const customerId = getShootCustomerId(getApp())
    const genderChanged =
      !!this._loadedGenderLabel && filterState.genderLabel !== this._loadedGenderLabel
    const customerChanged = customerId !== this._historyCustomerId

    if (genderChanged) {
      await this.loadStyles(this.data.count)
      return
    }

    if (customerChanged) {
      await this.refreshUsedStyleIds()
      if (this.data.stylePool.length) {
        this.applyStylePool(this.data.count, this.data.stylePool)
      } else {
        this.updateNavTitle(this.data.currentStyleName)
      }
      return
    }

    if (this.data.stylePool.length) {
      this.applyStylePool(this.data.count, this.data.stylePool)
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

  async refreshUsedStyleIds() {
    const app = getApp()
    const customerId = getShootCustomerId(app)
    const storeId = app.globalData.storeId
    this._historyCustomerId = customerId || ''

    if (!customerId || !storeId) {
      this._usedStyleIds = []
      return
    }

    try {
      this._usedStyleIds = await fetchCustomerUsedStyleIds(db, storeId, customerId)
    } catch (err) {
      console.warn('[style-selector] 读取客户风格历史失败', err)
      this._usedStyleIds = []
    }
  },

  pickStylesFromFiltered(filtered, count, filterState) {
    const n = count === 9 ? 9 : 3
    const usedStyleIds = this._usedStyleIds || []
    const preferRandom = !filterState.hasLinkedCustomer || usedStyleIds.length === 0
    return pickStylesForShoot(filtered, n, { usedStyleIds, preferRandom })
  },

  applyStylePool(count, pool) {
    const filterState = this.resolveGenderFilter()
    const styles = this.pickStylesFromFiltered(pool, count, filterState)
    let nextIndex = this.data.currentIndex
    if (nextIndex >= styles.length) nextIndex = 0
    const currentStyleName = styles[nextIndex]?.name || ''

    let stylesError = ''
    if (!pool.length) {
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
    const { loadingStyles, styles, originalUrl, count, stylePool } = merged
    const actualCount = (styles || []).length
    const wantNine = count === 9
    const poolSize = (stylePool || []).length
    const countShortfall = wantNine && actualCount > 0 && actualCount < 9
    const canSubmit =
      !!originalUrl && !loadingStyles && actualCount > 0 && !countShortfall
    let submitShowCost = true
    let submitPlainText = '立即生成'
    let submitCost = portraitCostForCount(actualCount || (wantNine ? 9 : 3))
    let countHint = ''
    if (wantNine && poolSize > 0 && poolSize < 9) {
      countHint = `当前性别仅 ${poolSize} 种风格，无法生成 9 张，请选 3 张或补充风格`
    } else if (countShortfall) {
      countHint = `仅匹配到 ${actualCount} 种风格，无法按 9 张套系提交`
    }
    if (loadingStyles) {
      submitShowCost = false
      submitPlainText = styles.length ? '风格切换中' : '加载风格中'
    } else if (!styles.length) {
      submitCost = portraitCostForCount(3)
    }
    this.setData({
      canSubmit,
      submitShowCost,
      submitPlainText,
      submitCost,
      countHint,
      ...extra
    })
  },

  async loadStyles(count) {
    const filterState = this.resolveGenderFilter()
    this.syncSubmitState({ loadingStyles: true, stylesError: '' })
    try {
      const [pool] = await Promise.all([
        fetchStyleTemplates(db, {
          collection: STYLE_TEMPLATES_COLLECTION,
          onlyEnabled: true,
          gender: filterState.genderLabel
        }),
        this.refreshUsedStyleIds()
      ])
      this._loadedGenderLabel = filterState.genderLabel
      if (!pool.length) {
        this.applyStylePool(count, [])
        wx.showToast({ title: '暂无可用风格', icon: 'none' })
        return
      }
      this.applyStylePool(count, pool)
    } catch (err) {
      console.error('[style-selector] 加载风格失败', err)
      this._loadedGenderLabel = ''
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
    if (count === 9 && this.data.stylePool.length > 0 && this.data.stylePool.length < 9) {
      wx.showToast({
        title: `当前仅 ${this.data.stylePool.length} 种风格，无法选 9 张`,
        icon: 'none',
        duration: 2600
      })
      return
    }
    this.setData({ count, currentIndex: 0 })
    if (this.data.stylePool.length) {
      this.applyStylePool(count, this.data.stylePool)
    } else {
      this.loadStyles(count)
    }
  },

  onGenderFilterTap(e) {
    const gender = e.currentTarget.dataset.gender
    if (!gender || gender === this.data.manualGender) return
    this.setData({ manualGender: gender, currentIndex: 0 }, () => {
      this.loadStyles(this.data.count)
    })
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
    const styles = this.data.styles || []
    if (!styles.length) {
      wx.showToast({ title: '该性别暂无可用风格', icon: 'none' })
      return
    }
    if (this.data.count === 9 && styles.length < 9) {
      wx.showToast({
        title: `仅 ${styles.length} 种风格，无法生成 9 张`,
        icon: 'none',
        duration: 2800
      })
      return
    }
    try {
      await assertPortraitBalance(styles.length)
    } catch (e) {
      return
    }
    setPendingShoot({
      count: styles.length,
      requestedCount: this.data.count === 9 ? 9 : 3,
      styles,
      originalUrl: this.data.originalUrl
    })
    const qs = buildShootQuery({
      count: this.data.count,
      originalUrl: this.data.originalUrl
    })
    wx.navigateTo({
      url: `/packageStore/pages/cloud/portrait-viewer/portrait-viewer?mode=live&${qs}`
    })
  }
})
