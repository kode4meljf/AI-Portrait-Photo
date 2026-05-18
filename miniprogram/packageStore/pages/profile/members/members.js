const app = getApp()
const { callStoreMember, isValidStoreId } = require('../../../../utils/storeSession')

function decorateMember(row) {
  const name = (row.nickName || '').trim() || '微信用户'
  return {
    ...row,
    displayName: name,
    initial: name.charAt(0) || '员',
    roleLabel: row.role === 'owner' ? '店长' : '员工',
    isOwnerRole: row.role === 'owner'
  }
}

function sortActive(list) {
  return [...list].sort((a, b) => {
    if (a.isOwnerRole && !b.isOwnerRole) return -1
    if (!a.isOwnerRole && b.isOwnerRole) return 1
    return 0
  })
}

Page({
  data: {
    storeId: '',
    isOwner: false,
    inviteToken: '',
    pending: [],
    active: [],
    loading: true,
    refreshing: false
  },

  onShow() {
    this.init()
  },

  async init() {
    this.setData({ loading: true })
    try {
      await app.refreshStoreSession()
      const storeId = app.globalData.storeId
      const isOwner = app.globalData.storeRole === 'owner'
      if (!isValidStoreId(storeId)) {
        wx.showToast({ title: '请先登录门店', icon: 'none' })
        return
      }
      this.setData({ storeId, isOwner })
      await this.loadMembers()
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadMembers() {
    const list = await callStoreMember('member.list', { storeId: this.data.storeId })
    const rows = (list.list || []).map(decorateMember)
    this.setData({
      pending: rows.filter((r) => r.status === 'pending'),
      active: sortActive(rows.filter((r) => r.status === 'active'))
    })
  },

  async onCreateInvite() {
    if (!this.data.isOwner) return
    try {
      wx.showLoading({ title: '生成中' })
      const res = await callStoreMember('invite.create', {
        storeId: this.data.storeId,
        expireHours: 24
      })
      wx.hideLoading()
      this.setData({ inviteToken: res.token })
      wx.setClipboardData({ data: res.token })
      wx.showToast({ title: '邀请码已复制', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '生成失败', icon: 'none' })
    }
  },

  onCopyInvite() {
    const token = this.data.inviteToken
    if (!token) return
    wx.setClipboardData({
      data: token,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  async onApprove(e) {
    const memberId = e.currentTarget.dataset.id
    try {
      await callStoreMember('member.approve', {
        storeId: this.data.storeId,
        memberId
      })
      wx.showToast({ title: '已通过', icon: 'success' })
      this.loadMembers()
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  },

  async onReject(e) {
    const memberId = e.currentTarget.dataset.id
    wx.showModal({
      title: '拒绝申请',
      content: '确定拒绝该员工的加入申请？',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callStoreMember('member.reject', {
            storeId: this.data.storeId,
            memberId
          })
          wx.showToast({ title: '已拒绝', icon: 'success' })
          this.loadMembers()
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

  async onDisable(e) {
    const memberId = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name || '该成员'
    wx.showModal({
      title: '移出员工',
      content: `确定将「${name}」移出门店？移出后将无法访问门店功能。`,
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callStoreMember('member.disable', {
            storeId: this.data.storeId,
            memberId
          })
          wx.showToast({ title: '已移出', icon: 'success' })
          this.loadMembers()
        } catch (err) {
          wx.showToast({ title: err.message || '操作失败', icon: 'none' })
        }
      }
    })
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadMembers()
      .catch(() => {})
      .finally(() => this.setData({ refreshing: false }))
  }
})
