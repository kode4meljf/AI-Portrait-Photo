const app = getApp()
const { callStoreMember, isValidStoreId } = require('../../../../utils/storeSession')
const { isStoreOwner } = require('../../../../utils/storeRole')
const { copyTextToClipboard } = require('../../../../utils/clipboard')

function decorateMember(row, isOwner) {
  const name = (row.nickName || '').trim() || '微信用户'
  const phone = (row.phone || '').trim()
  const remark = (row.remark || '').trim()
  return {
    ...row,
    displayName: name,
    initial: name.charAt(0) || '员',
    roleLabel: row.role === 'owner' ? '店长' : '员工',
    isOwnerRole: row.role === 'owner',
    phone,
    hasPhone: !!phone,
    remark,
    hasRemark: !!remark,
    canManage: isOwner && row.role !== 'owner'
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
    inviteQrUrl: '',
    pending: [],
    active: [],
    loading: true,
    refreshing: false,
    editVisible: false,
    editMemberId: '',
    editDisplayName: '',
    editRemark: '',
    editPhone: '',
    editSaving: false
  },

  onShow() {
    this.init()
  },

  async init() {
    this.setData({ loading: true })
    try {
      await app.refreshStoreSession()
      const storeId = app.globalData.storeId
      const isOwner = isStoreOwner(app)
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
    const res = await callStoreMember('member.list', { storeId: this.data.storeId })
    const isOwner = !!(res.isOwner || this.data.isOwner)
    const rows = (res.list || []).map((r) => decorateMember(r, isOwner))
    this.setData({
      isOwner,
      pending: rows.filter((r) => r.status === 'pending'),
      active: sortActive(rows.filter((r) => r.status === 'active'))
    })
  },

  findMember(memberId) {
    return (
      this.data.pending.find((r) => r._id === memberId) ||
      this.data.active.find((r) => r._id === memberId) ||
      null
    )
  },

  onEditMember(e) {
    if (!this.data.isOwner) return
    const memberId = e.currentTarget.dataset.id
    const row = this.findMember(memberId)
    if (!row || !row.canManage) return
    this.setData({
      editVisible: true,
      editMemberId: memberId,
      editDisplayName: row.displayName,
      editRemark: row.remark || '',
      editPhone: row.phone || ''
    })
  },

  closeEdit() {
    if (this.data.editSaving) return
    this.setData({ editVisible: false })
  },

  preventTouchMove() {},

  preventBubble() {},

  onEditRemarkInput(e) {
    this.setData({ editRemark: e.detail.value || '' })
  },

  onEditPhoneInput(e) {
    this.setData({ editPhone: (e.detail.value || '').trim() })
  },

  async onSaveEdit() {
    if (!this.data.editMemberId || this.data.editSaving) return
    this.setData({ editSaving: true })
    try {
      await callStoreMember('member.updateProfile', {
        storeId: this.data.storeId,
        memberId: this.data.editMemberId,
        remark: this.data.editRemark,
        phone: this.data.editPhone
      })
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ editVisible: false })
      await this.loadMembers()
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ editSaving: false })
    }
  },

  onCallPhone(e) {
    const phone = (e.currentTarget.dataset.phone || '').trim()
    if (!phone) return
    wx.makePhoneCall({ phoneNumber: phone })
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
      let inviteQrUrl = ''
      try {
        const qr = await callStoreMember('invite.qrImage', {
          storeId: this.data.storeId,
          token: res.token
        })
        inviteQrUrl = (qr && qr.tempFileURL) || ''
      } catch (qrErr) {
        console.warn('[members] invite.qrImage', qrErr)
      }
      this.setData({ inviteToken: res.token, inviteQrUrl })
      await copyTextToClipboard(res.token, { successToast: inviteQrUrl ? '邀请码已复制' : '邀请码已复制（二维码生成失败）' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '生成失败', icon: 'none' })
    }
  },

  async onCopyInvite() {
    const token = this.data.inviteToken
    if (!token) return
    await copyTextToClipboard(token, { successToast: '已复制' })
  },

  async onApprove(e) {
    if (!this.data.isOwner) return
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
    if (!this.data.isOwner) return
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
    if (!this.data.isOwner) return
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
