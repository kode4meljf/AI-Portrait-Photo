const { callStoreMember, applySessionToApp } = require('../../utils/storeSession')
const { parseInviteFromScan } = require('../../utils/inviteCode')

function formatExpireText(expireAt) {
  if (!expireAt || typeof expireAt !== 'number') return ''
  const d = new Date(expireAt)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`)
  return `邀请有效期至 ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function ensureOpenId() {
  const app = getApp()
  try {
    await app.ensureLogin()
    return true
  } catch (e) {
    console.error('[join] ensureLogin', e)
    wx.showToast({ title: '微信登录失败，请重试', icon: 'none' })
    return false
  }
}

Page({
  data: {
    token: '',
    staffNickName: '',
    preview: null,
    previewVisible: false,
    previewExpireText: '',
    submitting: false,
    sessionReady: false,
    phoneReady: false,
    phoneAuthId: '',
    phoneDisplay: ''
  },

  onLoad(options) {
    const raw = (options && (options.token || options.scene)) || ''
    const token = parseInviteFromScan(raw) || String(raw).trim()
    if (token) {
      this.setData({ token })
    }
    this.initSession()
  },

  async initSession() {
    const ok = await ensureOpenId()
    if (ok) this.setData({ sessionReady: true })
  },

  onTokenInput(e) {
    this.setData({ token: (e.detail.value || '').trim() })
  },

  async onScanInvite() {
    try {
      const scanRes = await new Promise((resolve, reject) => {
        wx.scanCode({
          onlyFromCamera: false,
          scanType: ['qrCode'],
          success: resolve,
          fail: reject
        })
      })
      const token = parseInviteFromScan(scanRes.result)
      if (!token) {
        wx.showToast({ title: '未识别到有效邀请码', icon: 'none' })
        return
      }
      this.setData({ token, preview: null, previewVisible: false, previewExpireText: '' })
      wx.showToast({ title: '已填入邀请码', icon: 'success' })
    } catch (e) {
      const msg = e && e.errMsg ? String(e.errMsg) : ''
      if (msg.indexOf('cancel') !== -1) return
      wx.showToast({ title: '扫码失败', icon: 'none' })
    }
  },

  onStaffNickNameInput(e) {
    this.setData({ staffNickName: (e.detail.value || '').trim() })
  },

  async onGetPhoneNumber(e) {
    if (e.detail.errMsg && !e.detail.errMsg.includes('ok')) {
      wx.showToast({ title: '未授权手机号', icon: 'none' })
      return
    }
    const code = e.detail.code
    if (!code) {
      wx.showToast({ title: '未获取到手机号授权', icon: 'none' })
      return
    }
    if (!(await ensureOpenId())) return

    try {
      wx.showLoading({ title: '获取中', mask: true })
      const res = await callStoreMember('phone.authorizeForJoin', { phoneCode: code })
      wx.hideLoading()
      this.setData({
        phoneAuthId: (res && res.phoneAuthId) || '',
        phoneReady: true,
        phoneDisplay: (res && res.phoneMask) || ''
      })
      wx.showToast({ title: '手机号已授权', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      this.setData({ phoneAuthId: '', phoneReady: false, phoneDisplay: '' })
      wx.showToast({ title: err.message || '手机号授权失败', icon: 'none' })
    }
  },

  preventTouchMove() {},

  preventBubble() {},

  closePreview() {
    if (this.data.submitting) return
    this.setData({ previewVisible: false })
  },

  validateBeforePreview() {
    const token = (this.data.token || '').trim()
    if (!token) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return null
    }
    const staffNickName = (this.data.staffNickName || '').trim()
    if (!staffNickName) {
      wx.showToast({ title: '请填写你的称呼', icon: 'none' })
      return null
    }
    return { token, staffNickName }
  },

  async onPreview() {
    const form = this.validateBeforePreview()
    if (!form) return
    if (!(await ensureOpenId())) return

    try {
      const preview = await callStoreMember('invite.preview', { token: form.token })
      this.setData({
        preview,
        previewVisible: true,
        previewExpireText: formatExpireText(preview.expireAt)
      })
    } catch (e) {
      wx.showToast({ title: e.message || '邀请码无效', icon: 'none' })
      this.setData({ preview: null, previewVisible: false, previewExpireText: '' })
    }
  },

  async onAccept() {
    const form = this.validateBeforePreview()
    if (!form) return
    if (!this.data.preview) {
      wx.showToast({ title: '请先查看门店信息', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    if (!(await ensureOpenId())) return

    this.setData({ submitting: true })
    try {
      const payload = {
        token: form.token,
        nickName: form.staffNickName
      }
      if (this.data.phoneAuthId) {
        payload.phoneAuthId = this.data.phoneAuthId
      }
      const res = await callStoreMember('invite.accept', payload)
      const app = getApp()
      await applySessionToApp(app)
      this.setData({ previewVisible: false })

      if (res.status === 'pending') {
        wx.showModal({
          title: '已提交申请',
          content: `已向「${this.data.preview.storeName || '门店'}」提交申请，请等待店长在「员工管理」中审核通过。`,
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
