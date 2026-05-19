const { callStoreMember } = require('../../../../utils/storeSession')

function formatExpire(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

Page({
  data: {
    loading: false,
    registerPath: '',
    expireAtStr: ''
  },

  async onGenerate() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const data = await callStoreMember('customerRegisterInvite.create', { expireHours: 168 })
      const path = `/pages/customer-register/register?token=${encodeURIComponent(data.token)}`
      this.setData({
        registerPath: path,
        expireAtStr: formatExpire(data.expireAt)
      })
    } catch (e) {
      wx.showToast({ title: e.message || '生成失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onCopyPath() {
    const path = this.data.registerPath
    if (!path) {
      wx.showToast({ title: '请先生成链接', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: path,
      success: () => wx.showToast({ title: '已复制小程序路径', icon: 'success' })
    })
  }
})
