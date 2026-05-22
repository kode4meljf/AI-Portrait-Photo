const app = getApp()
const { callCustomer, isValidStoreId } = require('../../../../utils/storeSession')
const { normalizeMobilePhone } = require('../../../../utils/phone')
const { validateStoreCustomerForm, showPhoneConflictModal } = require('../../../../utils/customerForm')

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
    customerDocId: '',
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
    const valid = validateStoreCustomerForm(this.data.form)
    const canSave = valid.ok
    if (canSave !== this.data.canSave) {
      this.setData({ canSave })
    }
  },

  async onSubmit() {
    if (this.data.submitting || !this.data.canSave || this.data.created) return

    const valid = validateStoreCustomerForm(this.data.form)
    if (!valid.ok) {
      wx.showToast({ title: valid.error, icon: 'none' })
      return
    }
    if (!isValidStoreId(app.globalData.storeId)) {
      wx.showToast({ title: '门店未就绪', icon: 'none' })
      return
    }

    this.setData({ submitting: true })
    try {
      const res = await callCustomer('createByStore', {
        nickName: valid.nickName,
        phone: valid.phone,
        remark: valid.remark
      })
      const tintKey = res._id || valid.nickName
      this.setData({
        created: true,
        customerDocId: res._id || '',
        qrPayload: res.qrPayload || '',
        avatarTint: pickAvatarTint(tintKey),
        avatarInitial: initialFromName(valid.nickName)
      })
      wx.setNavigationBarTitle({ title: '添加成功' })
    } catch (e) {
      if (e.code === 'PHONE_ALREADY_EXISTS') {
        showPhoneConflictModal(e, { title: '手机号已登记' })
        return
      }
      wx.showToast({ title: e.message || '创建失败', icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onCopyId() {
    if (!this.data.customerDocId) return
    wx.setClipboardData({
      data: this.data.customerDocId,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  onAddAnother() {
    this.setData({
      created: false,
      customerDocId: '',
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
