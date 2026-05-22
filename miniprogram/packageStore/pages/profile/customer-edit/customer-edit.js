const { callCustomer } = require('../../../../utils/storeSession')
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
    id: '',
    saving: false,
    changed: false,
    canSave: false,
    form: {
      nickName: '',
      phone: '',
      remark: ''
    },
    snapshot: {
      nickName: '',
      phone: '',
      remark: ''
    },
    avatarUrl: '',
    avatarInitial: '客',
    avatarTint: '#4e7cf6',
    wxNickName: '',
    phoneLocked: false
  },

  onLoad(options) {
    const id = options.id || ''
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
      return
    }
    this.setData({ id })
    this.loadCustomer()
  },

  async loadCustomer() {
    try {
      const db = wx.cloud.database()
      const res = await db.collection('customers').doc(this.data.id).get()
      const data = res.data
      const nickName = data.nickName || ''
      const phone = data.phone || ''
      const remark = data.remark || ''
      const snapshot = { nickName, phone, remark }
      this.setData({
        form: { ...snapshot },
        snapshot,
        changed: false,
        canSave: false,
        avatarUrl: data.avatarUrl || '',
        avatarInitial: initialFromName(nickName || data.wxNickName),
        avatarTint: pickAvatarTint(this.data.id || nickName || data.wxNickName),
        wxNickName: (data.wxNickName || '').trim(),
        phoneLocked: !!(data.wxOpenId || '').trim()
      })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail.value || ''
    const patch = { [`form.${key}`]: value }
    if (key === 'nickName') {
      patch.avatarInitial = initialFromName(value)
    }
    this.setData(patch, this.refreshSaveState)
  },

  refreshSaveState() {
    const { form, snapshot } = this.data
    const changed =
      form.nickName !== snapshot.nickName ||
      form.phone !== snapshot.phone ||
      form.remark !== snapshot.remark
    const valid = validateStoreCustomerForm(form)
    this.setData({
      changed,
      canSave: changed && valid.ok
    })
  },

  async onSave() {
    if (this.data.saving || !this.data.canSave) return

    const valid = validateStoreCustomerForm(this.data.form)
    if (!valid.ok) {
      wx.showToast({ title: valid.error, icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      await callCustomer('updateByStore', {
        customerDocId: this.data.id,
        nickName: valid.nickName,
        phone: valid.phone,
        remark: valid.remark
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      if (e.code === 'PHONE_ALREADY_EXISTS') {
        showPhoneConflictModal(e)
        return
      }
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
