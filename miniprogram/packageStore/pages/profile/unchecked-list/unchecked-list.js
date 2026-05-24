/**
 * @file 打卡名单（今日/昨日已打卡、今日尚未打卡）
 */

const app = getApp()
const { getCurrentDate } = require('../../../../utils/date')
const { storeCustomersWhere } = require('../../../../utils/customerQuery')
const {
  mergeDayCheckinMap,
  resolveMode,
  resolveNavTitle,
  buildSummary,
  matchesSearch,
  mapListRow,
  sortList,
  filterByChips,
  emptyHint,
  emptySubHint
} = require('../../../../utils/checkinListPage')

Page({
  data: {
    date: '',
    mode: 'checked',
    summary: {},
    searchKeyword: '',
    sortKey: 'time',
    wxOnly: false,
    streakOnly: false,
    customers: [],
    displayList: [],
    totalCustomers: 0,
    loading: false,
    loadError: ''
  },

  _allRows: [],
  _checkinMap: new Map(),

  onLoad(options) {
    const date = (options.date || getCurrentDate()).trim()
    const mode = resolveMode(options)
    const sortKey = mode === 'unchecked' ? 'lastVisit' : 'time'
    wx.setNavigationBarTitle({ title: resolveNavTitle(mode, date) })
    this.setData({ date, mode, sortKey })
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList().finally(() => wx.stopPullDownRefresh())
  },

  debounceApplyFilter() {
    if (this._filterTimer) clearTimeout(this._filterTimer)
    this._filterTimer = setTimeout(() => {
      this.applyFilter()
      this._filterTimer = null
    }, 200)
  },

  async loadList() {
    const storeId = (app.globalData.storeId || '').trim()
    if (!storeId) {
      this.setData({
        loading: false,
        loadError: '请先登录门店',
        customers: [],
        displayList: [],
        totalCustomers: 0,
        summary: buildSummary({
          mode: this.data.mode,
          dateStr: this.data.date,
          totalCustomers: 0,
          listCount: 0
        })
      })
      return
    }

    this.setData({ loading: true, loadError: '' })
    try {
      const db = wx.cloud.database()
      const _ = db.command
      const { date, mode } = this.data
      const dayStart = new Date(`${date}T00:00:00`).getTime()
      const dayEnd = dayStart + 86400000 - 1

      const [customersRes, byDateRes, byTimeRes] = await Promise.all([
        db
          .collection('customers')
          .where(storeCustomersWhere(db, storeId))
          .limit(1000)
          .get(),
        db
          .collection('checkins')
          .where({ storeId, checkinDate: date })
          .limit(1000)
          .get(),
        db
          .collection('checkins')
          .where({ storeId, createTime: _.gte(dayStart).and(_.lte(dayEnd)) })
          .limit(1000)
          .get()
      ])

      const allCustomers = customersRes.data || []
      const checkinMap = mergeDayCheckinMap([
        ...(byDateRes.data || []),
        ...(byTimeRes.data || [])
      ])
      this._checkinMap = checkinMap

      const checkedIds = new Set(checkinMap.keys())
      const filtered =
        mode === 'checked'
          ? allCustomers.filter((c) => checkedIds.has(c._id))
          : allCustomers.filter((c) => !checkedIds.has(c._id))

      const ctx = { mode, dateStr: date, checkinMap }
      this._allRows = filtered.map((c) => mapListRow(c, ctx))
      this.setData({ totalCustomers: allCustomers.length })
      this.applyFilter()
    } catch (err) {
      console.error('[checkin-list] load failed', err)
      this.setData({
        loadError: '加载失败，请下拉重试',
        customers: [],
        displayList: []
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  applyFilter() {
    const { searchKeyword, sortKey, mode, wxOnly, streakOnly, date, totalCustomers } =
      this.data
    let list = this._allRows.filter((row) => matchesSearch(row, searchKeyword))
    list = filterByChips(list, { mode, sortKey, wxOnly, streakOnly })
    const effectiveSort = sortKey === 'lastVisit' ? 'time' : sortKey
    list = sortList(list, effectiveSort === 'time' ? 'time' : sortKey, mode)

    const summary = buildSummary({
      mode,
      dateStr: date,
      totalCustomers,
      listCount: this._allRows.length
    })

    this.setData({
      customers: list,
      displayList: list,
      summary,
      emptyMain: emptyHint({ mode, searchKeyword, dateStr: date }),
      emptySub: emptySubHint(mode)
    })
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: (e.detail.value || '').trim() })
    this.debounceApplyFilter()
  },

  onClearSearch() {
    this.setData({ searchKeyword: '' })
    this.applyFilter()
  },

  onChipTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const { mode, sortKey, wxOnly, streakOnly } = this.data
    if (key === 'time' || key === 'name' || key === 'lastVisit') {
      this.setData({ sortKey: key })
      this.applyFilter()
      return
    }
    if (key === 'wxOnly' && mode === 'checked') {
      this.setData({ wxOnly: !wxOnly, sortKey: 'time' })
      this.applyFilter()
      return
    }
    if (key === 'streak' && mode === 'unchecked') {
      this.setData({ streakOnly: !streakOnly, sortKey: 'lastVisit' })
      this.applyFilter()
    }
  },

  onCustomerTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({
      url: `/packageStore/pages/profile/customer-edit/customer-edit?id=${id}`
    })
  }
})
