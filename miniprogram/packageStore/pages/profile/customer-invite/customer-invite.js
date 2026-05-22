const { callStoreMember } = require('../../../../utils/storeSession')
const { getInviteEnvVersion } = require('../../../../utils/inviteEnv')

function formatExpire(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

Page({
  data: {
    loading: false,
    generated: false,
    inviteQrUrl: '',
    inviteLink: '',
    expireAtStr: ''
  },

  async onCreateInvite() {
    if (this.data.loading) return
    this.setData({ loading: true })
    const envVersion = getInviteEnvVersion()
    try {
      wx.showLoading({ title: '生成中' })
      const res = await callStoreMember('customerRegisterInvite.create', {
        expireHours: 168,
        envVersion
      })
      const token = res.token
      const inviteLink = (res.inviteLink || res.urlLink || '').trim()

      let inviteQrUrl = ''
      try {
        const qr = await callStoreMember('customerRegisterInvite.qrImage', { token, envVersion })
        inviteQrUrl = (qr && qr.tempFileURL) || ''
      } catch (qrErr) {
        console.warn('[customer-invite] wxacode', qrErr)
        wx.showToast({
          title: qrErr.message || '小程序码生成失败',
          icon: 'none',
          duration: 2800
        })
      }

      wx.hideLoading()
      this.setData({
        generated: true,
        inviteLink,
        inviteQrUrl,
        expireAtStr: formatExpire(res.expireAt)
      })
      wx.showToast({
        title: inviteQrUrl ? '小程序码已生成' : '链接已生成（小程序码失败）',
        icon: inviteQrUrl ? 'success' : 'none'
      })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e.message || '生成失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onCopyLink() {
    const link = this.data.inviteLink
    if (!link) {
      wx.showToast({ title: '暂无链接，请重新生成', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: '已复制邀请链接', icon: 'success' })
    })
  }
})
