/**
 * customer-picker 组件
 * 底部滑出式客户选择器
 */

const app = getApp()

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(newVal) {
        if (newVal) {
          // 打开时加载数据（如果还没加载过）
          if (this.data.customers.length === 0) {
            this.loadCustomers()
          }
        }
      }
    },
    selectedId: {
      type: String,
      value: ''
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

    // 遮罩层点击关闭
    onOverlayTap() {
      this.triggerEvent('close')
    },

    // 关闭按钮
    onClose() {
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

    // 计算统计数据
    calcStats(customers) {
      const totalCustomers = customers.length
      const totalCheckins = customers.reduce((sum, c) => sum + (c.totalCheckins || 0), 0)
      this.setData({ totalCustomers, totalCheckins })
    },

    // 加载客户列表
    async loadCustomers(isLoadMore = false) {
      if (this.data.loading) return
      if (isLoadMore && !this.data.hasMore) return

      this.setData({ loading: true })

      try {
        const db = wx.cloud.database()
        let query = db.collection('customers')

        // 服务端模糊搜索
        if (this.data.searchKeyword) {
          const _ = db.command
          query = query.where(
            _.or([
              { nickName: db.RegExp({ regexp: this.data.searchKeyword, options: 'i' }) },
              { phone: db.RegExp({ regexp: this.data.searchKeyword, options: 'i' }) }
            ])
          )
        }

        const skip = isLoadMore ? this.data.currentPage * this.data.pageSize : 0
        const res = await query
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(this.data.pageSize)
          .get()

        const customers = res.data.map(c => ({
          ...c,
          createTimeStr: c.createTime ? this.formatDate(c.createTime) : ''
        }))

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

    // 点击客户
    onCustomerTap(e) {
      const customer = e.currentTarget.dataset.customer

      // 存储到全局
      app.globalData.selectedCustomerId = customer._id
      app.globalData.selectedCustomer = customer
      wx.setStorageSync('selectedCustomerId', customer._id)

      // 选中高亮
      this.setData({ selectedId: customer._id })

      // 短暂延迟，让用户看到选中效果
      setTimeout(() => {
        this.triggerEvent('select', { customer })
        this.triggerEvent('close')
      }, 150)
    }
  }
})
