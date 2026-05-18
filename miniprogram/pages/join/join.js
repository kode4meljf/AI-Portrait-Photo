const { callStoreMember, applySessionToApp } = require('../../utils/storeSession')

Page({
  data: {
    token: '',
    preview: null,
    submitting: false
  },

  onTokenInput(e) {
    this.setData({ token: (e.detail.value || '').trim() })
  },

  async onPreview() {
    const token = this.data.token
    if (!token) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    try {
      const preview = await callStoreMember('invite.preview', { token })
      this.setData({ preview })
    } catch (e) {
      wx.showToast({ title: e.message || '邀请码无效', icon: 'none' })
      this.setData({ preview: null })
    }
  },

  async onAccept() {
    const token = this.data.token
    if (!token) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const res = await callStoreMember('invite.accept', { token })
      const app = getApp()
      await applySessionToApp(app)
      if (res.status === 'pending') {
        wx.showModal({
          title: '已提交申请',
          content: '请等待店长审核通过后再使用门店功能',
          showCancel: false,
          success: () => wx.reLaunch({ url: '/pages/launch/launch' })
        })
        return
      }
      wx.reLaunch({ url: '/pages/index/index' })
    } catch (e) {
      wx.showToast({ title: e.message || '加入失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
