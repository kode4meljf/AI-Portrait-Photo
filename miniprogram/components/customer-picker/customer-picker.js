/**
 * customer-picker 组件
 * 底部滑出式客户选择器
 */

const app = getApp()

function isToday(timestamp) {
  if (!timestamp) return false
  const d = new Date(timestamp)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const AVATAR_BG = ['#4e7cf6', '#5ac8a8', '#f5a623', '#e85d75', '#8b6fd4', '#3db0e4', '#7ebc59', '#d94dbb']

function pickAvatarTint(key) {
  const s = String(key || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]
}

function initialFromName(name) {
  const t = (name || '').trim()
  if (!t) return '客'
  return t.slice(0, 1)
}

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
    editingId: '',
    editForm: { nickName: '', phone: '', remark: '' },
    editSnapshot: { nickName: '', phone: '', remark: '' },
    editAvatarUrl: '',
    editAvatarInitial: '客',
    editAvatarTint: '#4e7cf6',
    editChanged: false,
    editSaving: false,
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

        const customers = res.data.map(c => {
          const nick = c.nickName || '匿名用户'
          return {
            ...c,
            todayCheckedIn: isToday(c.lastCheckinTime || c.lastCheckinDate),
            createTimeStr: c.createTime ? this.formatDate(c.createTime) : '',
            avatarInitial: initialFromName(c.nickName),
            avatarTint: pickAvatarTint(c._id || nick)
          }
        })

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

      app.globalData.selectedCustomerId = customer._id
      app.globalData.selectedCustomer = customer
      wx.setStorageSync('selectedCustomerId', customer._id)

      this.setData({ selectedId: customer._id })

      setTimeout(() => {
        this.triggerEvent('select', { customer })
        this.triggerEvent('close')
      }, 150)
    },

    avatarMetaFromCustomer(customer, id) {
      const nick = customer?.nickName || ''
      return {
        editAvatarUrl: customer?.avatarUrl || '',
        editAvatarInitial: customer?.avatarInitial || initialFromName(nick),
        editAvatarTint: customer?.avatarTint || pickAvatarTint(id || nick),
      }
    },

    async onEditCustomer(e) {
      const id = e.currentTarget.dataset.id
      if (!id) return
      wx.hideKeyboard()
      let customer = this.data.filteredCustomers.find((c) => c._id === id)
      if (!customer) {
        try {
          const db = wx.cloud.database()
          const res = await db.collection('customers').doc(id).get()
          customer = res.data
        } catch (err) {
          wx.showToast({ title: '加载失败', icon: 'none' })
          return
        }
      }
      const nickName = customer.nickName || ''
      const phone = customer.phone || ''
      const remark = customer.remark || ''
      const snapshot = { nickName, phone, remark }
      this.setData({
        editPanelVisible: true,
        editingId: id,
        editForm: { ...snapshot },
        editSnapshot: { ...snapshot },
        ...this.avatarMetaFromCustomer(customer, id),
        editChanged: false,
        editSaving: false,
      })
    },

    onEditBack() {
      wx.hideKeyboard()
      this.setData({
        editPanelVisible: false,
        editingId: '',
        editChanged: false,
        editSaving: false,
      })
    },

    onEditInput(e) {
      const key = e.currentTarget.dataset.key
      const value = e.detail.value || ''
      const editForm = { ...this.data.editForm, [key]: value }
      const { editSnapshot } = this.data
      const editChanged =
        editForm.nickName !== editSnapshot.nickName ||
        editForm.phone !== editSnapshot.phone ||
        editForm.remark !== editSnapshot.remark
      const patch = { editForm, editChanged }
      if (key === 'nickName') {
        patch.editAvatarInitial = initialFromName(value)
      }
      this.setData(patch)
    },

    async onEditSave() {
      if (this.data.editSaving || !this.data.editChanged || !this.data.editingId) return
      this.setData({ editSaving: true })
      try {
        const db = wx.cloud.database()
        const nickName = (this.data.editForm.nickName || '').trim()
        const phone = (this.data.editForm.phone || '').trim()
        const remark = (this.data.editForm.remark || '').trim()
        await db.collection('customers').doc(this.data.editingId).update({
          data: {
            nickName,
            phone,
            remark,
            updateTime: Date.now(),
          },
        })
        if (app.globalData.selectedCustomerId === this.data.editingId) {
          const latest = await db.collection('customers').doc(this.data.editingId).get()
          app.globalData.selectedCustomer = latest.data
          this.triggerEvent('customerUpdated', { customer: latest.data })
        }
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.setData({
          editPanelVisible: false,
          editingId: '',
          editChanged: false,
          customers: [],
          filteredCustomers: [],
          hasMore: true,
          currentPage: 0,
        })
        await this.loadCustomers()
      } catch (err) {
        console.error('[customer-picker] 保存客户失败:', err)
        wx.showToast({ title: '保存失败', icon: 'none' })
      } finally {
        this.setData({ editSaving: false })
      }
    },
  }
})
