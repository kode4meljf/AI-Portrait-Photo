const app = getApp()
const { callCustomer, isValidStoreId } = require('../../../../utils/storeSession')
const { normalizeMobilePhone } = require('../../../../utils/phone')
const { findStoreCustomerByPhone } = require('../../../utils/customerQuery')
const {
  validateStoreCustomerForm,
  showCustomerPhoneError,
  showPhoneConflictModal
} = require('../../../../utils/customerForm')
const { DEFAULT_GENDER, normalizeGender } = require('../../../../utils/customerGender')

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
  behaviors: [require('../../../../behaviors/pageShare')],
  data: {
    form: {
      nickName: '',
      phone: '',
      remark: '',
      gender: DEFAULT_GENDER,
      address: ''
    },
    avatarInitial: '客',
    avatarTint: '#4e7cf6',
    canSave: false,
    submitting: false,
    created: false
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

  onGenderTap(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ 'form.gender': normalizeGender(value) }, this.refreshCanSave)
  },

  refreshCanSave() {
    const valid = validateStoreCustomerForm(this.data.form)
    const canSave = valid.ok
    if (canSave !== this.data.canSave) {
      this.setData({ canSave })
    }
  },

  async onSubmit() {
    if (this.data.created) return
    if (this.data.submitting) {
      wx.showToast({ title: '正在保存…', icon: 'none' })
      return
    }

    const valid = validateStoreCustomerForm(this.data.form)
    if (!valid.ok) {
      wx.showToast({ title: valid.error, icon: 'none' })
      return
    }
    if (!this.data.canSave) {
      wx.showToast({ title: valid.error || '请完善客户信息', icon: 'none' })
      return
    }
    const storeId = app.globalData.storeId
    if (!isValidStoreId(storeId)) {
      wx.showToast({ title: '门店未就绪', icon: 'none' })
      return
    }

    try {
      const existing = await findStoreCustomerByPhone(storeId, valid.phone)
      if (existing) {
        showPhoneConflictModal({
          message: '该手机号在本店已有客户档案，请勿重复建档',
          existingId: existing._id,
          code: 'PHONE_ALREADY_EXISTS'
        })
        return
      }
    } catch (preErr) {
      console.warn('[customer-create] phone precheck failed', preErr)
    }

    this.setData({ submitting: true })
    try {
      const res = await callCustomer('createByStore', {
        nickName: valid.nickName,
        phone: valid.phone,
        remark: valid.remark,
        gender: valid.gender,
        address: valid.address
      })
      const tintKey = res._id || valid.nickName
      this.setData({
        created: true,
        avatarTint: pickAvatarTint(tintKey),
        avatarInitial: initialFromName(valid.nickName)
      })
      wx.setNavigationBarTitle({ title: '添加成功' })
    } catch (e) {
      console.error('[customer-create]', e)
      const msg = (e && e.message) || '创建失败'
      if (!showCustomerPhoneError(e, { title: '手机号已登记' })) {
        wx.showModal({
          title: '保存失败',
          content: msg,
          showCancel: false,
          confirmText: '知道了'
        })
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  onAddAnother() {
    this.setData({
      created: false,
      form: { nickName: '', phone: '', remark: '', gender: DEFAULT_GENDER, address: '' },
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
