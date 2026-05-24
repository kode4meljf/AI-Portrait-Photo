/**
 * customer-picker 组件
 * 底部滑出式客户选择器
 */

const app = getApp()
const { mapCustomerRow, calcListStats } = require('../../utils/customerListDisplay')

const STORE_OPTION_ID = '__all_store__'

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(newVal) {
        if (newVal) {
          if (this.data.customers.length === 0) {
            this.loadCustomers()
          }
        } else {
          this.setData({ editPanelVisible: false, editingId: '' })
        }
      }
    },
    selectedId: {
      type: String,
      value: ''
    },
    includeStoreOption: {
      type: Boolean,
      value: false
    },
    storeOptionLabel: {
      type: String,
      value: '全店客户'
    },
    /** false 时仅触发 select 事件，不写首页拍摄会话 */
    applyGlobalSelection: {
      type: Boolean,
      value: true
    }
  },

  data: {
    customers: [],
    filteredCustomers: [],
    searchKeyword: '',
    loading: false,
    refreshing: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    totalCustomers: 0,
    totalCheckins: 0,
    editPanelVisible: false,
    editingId: ''
  },

  methods: {
    // 防抖
    debounce(fn, delay = 300) {
      if (this._searchTimer) clearTimeout(this._searchTimer)
      this._searchTimer = setTimeout(() => {
        fn.call(this)
        this._searchTimer = null
      }, delay)
    },

    // 阻止点击穿透
    stopPropagation() {},

    // 阻止触摸滚动穿透
    stopTouchMove() {
      return false
    },

    // 遮罩层点击关闭
    onOverlayTap() {
      wx.hideKeyboard()
      if (this.data.editPanelVisible) {
        this.onEditBack()
        return
      }
      this.triggerEvent('close')
    },

    onClose() {
      wx.hideKeyboard()
      if (this.data.editPanelVisible) {
        this.onEditBack()
        return
      }
      this.triggerEvent('close')
    },

    // 搜索输入（带防抖，服务端查询）
    onSearchInput(e) {
      const keyword = e.detail.value || ''
      this.setData({ searchKeyword: keyword })
      this.debounce(() => {
        this.setData({ customers: [], filteredCustomers: [], hasMore: true, currentPage: 0 })
        this.loadCustomers()
      }, 300)
    },

    // 清空搜索
    onClearSearch() {
      this.setData({ searchKeyword: '', customers: [], filteredCustomers: [], hasMore: true, currentPage: 0 })
      this.loadCustomers()
    },

    calcStats(customers) {
      this.setData(calcListStats(customers))
    },

    // 加载客户列表
    async loadCustomers(isLoadMore = false) {
      if (this.data.loading) return
      if (isLoadMore && !this.data.hasMore) return

      this.setData({ loading: true })

      try {
        const db = wx.cloud.database()
        const storeId = app.globalData.storeId
        if (!storeId) {
          this.setData({ customers: [], filteredCustomers: [] })
          this.calcStats([])
          return
        }

        let query = db.collection('customers').where({ storeId })

        // 服务端模糊搜索
        if (this.data.searchKeyword) {
          const _ = db.command
          query = db.collection('customers').where(
            _.and([
              { storeId },
              _.or([
                { nickName: db.RegExp({ regexp: this.data.searchKeyword, options: 'i' }) },
                { phone: db.RegExp({ regexp: this.data.searchKeyword, options: 'i' }) }
              ])
            ])
          )
        }

        const skip = isLoadMore ? this.data.currentPage * this.data.pageSize : 0
        const res = await query
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(this.data.pageSize)
          .get()

        const customers = res.data.map((c) => mapCustomerRow(c))

        const allCustomers = isLoadMore ? [...this.data.customers, ...customers] : customers

        this.setData({
          customers: allCustomers,
          filteredCustomers: allCustomers,
          hasMore: res.data.length === this.data.pageSize,
          currentPage: isLoadMore ? this.data.currentPage + 1 : 1,
        })

        this.calcStats(allCustomers)
      } catch (err) {
        console.error('[customer-picker] 加载客户失败:', err)
        if (!isLoadMore) {
          this.setData({ customers: [], filteredCustomers: [] })
          this.calcStats([])
        }
      } finally {
        this.setData({ loading: false, refreshing: false })
      }
    },

    formatDate(date) {
      if (!date) return ''
      const d = new Date(date)
      return `${d.getMonth() + 1}/${d.getDate()}`
    },

    // 下拉刷新
    onPullDownRefresh() {
      this.setData({ customers: [], filteredCustomers: [], hasMore: true, currentPage: 0, refreshing: true, searchKeyword: '' })
      this.loadCustomers()
    },

    // 上拉加载更多
    onReachBottom() {
      if (this.data.hasMore && !this.data.loading) {
        this.loadCustomers(true)
      }
    },

    onStoreOptionTap() {
      if (this.properties.applyGlobalSelection) {
        app.globalData.selectedCustomerId = null
        app.globalData.selectedCustomer = null
        wx.removeStorageSync('selectedCustomerId')
      }
      this.setData({ selectedId: STORE_OPTION_ID })
      setTimeout(() => {
        this.triggerEvent('select', { allStore: true })
        this.triggerEvent('close')
      }, 150)
    },

    // 点击客户
    onCustomerTap(e) {
      const customer = e.currentTarget.dataset.customer

      if (this.properties.applyGlobalSelection) {
        app.globalData.selectedCustomerId = customer._id
        app.globalData.selectedCustomer = customer
        wx.setStorageSync('selectedCustomerId', customer._id)
      }

      this.setData({ selectedId: customer._id })

      setTimeout(() => {
        this.triggerEvent('select', { customer })
        this.triggerEvent('close')
      }, 150)
    },

    onEditCustomer(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      wx.hideKeyboard()
      this.setData({ editPanelVisible: true, editingId: id })
    },

    onEditBack() {
      this.setData({ editPanelVisible: false, editingId: '' })
    },

    async onEditSaved(e) {
      const { customer } = e.detail || {}
      if (customer && app.globalData.selectedCustomerId === customer._id) {
        this.triggerEvent('customerUpdated', { customer })
      }
      this.setData({
        editPanelVisible: false,
        editingId: '',
        customers: [],
        filteredCustomers: [],
        hasMore: true,
        currentPage: 0
      })
      await this.loadCustomers()
    },

    async onEditDeleted(e) {
      const { customerId } = e.detail || {}
      if (customerId && this.data.selectedId === customerId) {
        this.setData({ selectedId: '' })
        this.triggerEvent('customerUpdated', { customer: null })
      }
      this.setData({
        editPanelVisible: false,
        editingId: '',
        customers: [],
        filteredCustomers: [],
        hasMore: true,
        currentPage: 0
      })
      await this.loadCustomers()
    },
  }
})
