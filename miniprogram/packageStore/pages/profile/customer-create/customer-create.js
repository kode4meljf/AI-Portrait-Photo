const app = getApp()
const { callCustomer, isValidStoreId } = require('../../../../utils/storeSession')

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

Page({
  data: {
    form: {
      nickName: '',
      phone: '',
      remark: ''
    },
    avatarInitial: '客',
    avatarTint: '#4e7cf6',
    canSave: false,
    submitting: false,
    created: false,
    customerId: '',
    qrPayload: ''
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value || ''
    const patch = { [`form.${key}`]: value }
    if (key === 'nickName') {
      patch.avatarInitial = initialFromName(value)
      patch.avatarTint = pickAvatarTint(value)
    }
    this.setData(patch, this.refreshCanSave)
  },

  refreshCanSave() {
    const canSave = !!(this.data.form.nickName || '').trim()
    if (canSave !== this.data.canSave) {
      this.setData({ canSave })
    }
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSave || this.data.created) return

    const nickName = (this.data.form.nickName || '').trim()
    if (!nickName) {
      wx.showToast({ title: '请填写客户昵称', icon: 'none' })
      return
    }
    if (!isValidStoreId(app.globalData.storeId)) {
      wx.showToast({ title: '门店未就绪', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const res = await callCustomer('createByStore', {
        nickName,
        phone: (this.data.form.phone || '').trim(),
        remark: (this.data.form.remark || '').trim()
      })
      const tintKey = res.customerId || nickName
      this.setData({
        created: true,
        customerId: res.customerId || '',
        qrPayload: res.qrPayload || '',
        avatarTint: pickAvatarTint(tintKey),
        avatarInitial: initialFromName(nickName)
      })
      wx.setNavigationBarTitle({ title: res.merged ? '已有档案' : '添加成功' })
      if (res.merged) {
        wx.showToast({ title: '该手机号已有客户，已合并', icon: 'none', duration: 2500 })
      }
    } catch (e) {
      wx.showToast({ title: e.message || '创建失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onCopyId() {
    if (!this.data.customerId) return
    wx.setClipboardData({
      data: this.data.customerId,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  onAddAnother() {
    this.setData({
      created: false,
      customerId: '',
      qrPayload: '',
      form: { nickName: '', phone: '', remark: '' },
      avatarInitial: '客',
      avatarTint: pickAvatarTint(''),
      canSave: false
    })
    wx.setNavigationBarTitle({ title: '添加客户' })
  },

  onDone() {
    wx.navigateBack()
  }
})
