const { callCustomer } = require('../../../../utils/storeSession')
const { validateStoreCustomerForm, showCustomerPhoneError } = require('../../../../utils/customerForm')
const { canShowDeleteCustomer, confirmDeleteCustomer } = require('../../../../utils/customerDelete')
const { getCurrentDate } = require('../../../utils/date')
const { DEFAULT_GENDER, normalizeGender } = require('../../../../utils/customerGender')

const app = getApp()

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
      remark: '',
      gender: DEFAULT_GENDER,
      address: ''
    },
    snapshot: {
      nickName: '',
      phone: '',
      remark: '',
      gender: DEFAULT_GENDER,
      address: ''
    },
    avatarUrl: '',
    avatarInitial: '客',
    avatarTint: '#4e7cf6',
    wxNickName: '',
    phoneLocked: false,
    canDelete: false,
    deleting: false,
    customerRaw: null,
    isFollowUp: false,
    followUpDate: ''
  },

  onLoad(options) {
    const id = options.id || ''
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 400)
      return
    }
    const isFollowUp = options.mode === 'followup'
    const followUpDate = (options.date || getCurrentDate()).trim()
    if (isFollowUp) {
      wx.setNavigationBarTitle({ title: '客户跟进' })
    }
    this.setData({ id, isFollowUp, followUpDate })
    this.loadCustomer(isFollowUp)
  },

  async loadCustomer(isFollowUpMode) {
    const followUp = typeof isFollowUpMode === 'boolean' ? isFollowUpMode : this.data.isFollowUp
    try {
      const db = wx.cloud.database()
      const res = await db.collection('customers').doc(this.data.id).get()
      const data = res.data
      const wxNick = (data.wxNickName || '').trim()
      const nickName = (data.nickName || '').trim()
      const displayNickName = nickName || wxNick
      const phone = data.phone || ''
      const remark = data.remark || ''
      const gender = normalizeGender(data.gender)
      const address = (data.address || '').trim()
      const snapshot = { nickName, phone, remark, gender, address }
      const formNickName = followUp ? displayNickName : nickName
      this.setData({
        form: { nickName: formNickName, phone, remark, gender, address },
        snapshot,
        changed: false,
        canSave: false,
        avatarUrl: data.avatarUrl || '',
        avatarInitial: initialFromName(nickName || data.wxNickName),
        avatarTint: pickAvatarTint(this.data.id || nickName || data.wxNickName),
        wxNickName: (data.wxNickName || '').trim(),
        phoneLocked: !!(data.wxOpenId || '').trim(),
        customerRaw: data,
        canDelete: canShowDeleteCustomer(data, app)
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

  onGenderTap(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ 'form.gender': normalizeGender(value) }, this.refreshSaveState)
  },

  onRemarkInput(e) {
    const value = e.detail.value || ''
    this.setData({ 'form.remark': value }, this.refreshSaveState)
  },

  onDialPhone() {
    const phone = String(this.data.form.phone || '').trim()
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '暂无有效手机号', icon: 'none' })
      return
    }
    wx.makePhoneCall({
      phoneNumber: phone,
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        if (!/cancel/i.test(msg)) {
          wx.showToast({ title: '无法拨号', icon: 'none' })
        }
      }
    })
  },

  refreshSaveState() {
    const { form, snapshot, isFollowUp } = this.data
    if (isFollowUp) {
      const changed = form.remark !== snapshot.remark
      this.setData({ changed, canSave: changed })
      return
    }
    const changed =
      form.nickName !== snapshot.nickName ||
      form.phone !== snapshot.phone ||
      form.remark !== snapshot.remark ||
      form.gender !== snapshot.gender ||
      form.address !== snapshot.address
    const valid = validateStoreCustomerForm(form)
    this.setData({
      changed,
      canSave: changed && valid.ok
    })
  },

  async onSave() {
    if (this.data.saving || !this.data.canSave) return

    const { isFollowUp, followUpDate, form } = this.data

    if (isFollowUp) {
      this.setData({ saving: true })
      try {
        await callCustomer('followUpByStore', {
          followUpDate,
          customerDocId: this.data.id,
          remark: (form.remark || '').trim()
        })
        wx.showToast({ title: '保存成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 400)
      } catch (e) {
        const msg = e.message || '保存失败'
        const hint = /未知 action|请填写客户称呼/i.test(msg)
          ? '请重新部署 customer 云函数后重试'
          : msg
        wx.showToast({ title: hint, icon: 'none', duration: 2800 })
      } finally {
        this.setData({ saving: false })
      }
      return
    }

    const valid = validateStoreCustomerForm(form)
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
        remark: valid.remark,
        gender: valid.gender,
        address: valid.address
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      if (showCustomerPhoneError(e)) return
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  async onDelete() {
    if (this.data.deleting || !this.data.canDelete || !this.data.customerRaw) return
    const confirmed = await confirmDeleteCustomer(this.data.customerRaw)
    if (!confirmed) return

    this.setData({ deleting: true })
    try {
      await callCustomer('deleteByStore', { customerDocId: this.data.id })
      if (app.globalData.selectedCustomerId === this.data.id) {
        app.globalData.selectedCustomerId = null
        app.globalData.selectedCustomer = null
        wx.removeStorageSync('selectedCustomerId')
      }
      wx.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      wx.showToast({ title: e.message || '删除失败', icon: 'none' })
    } finally {
      this.setData({ deleting: false })
    }
  }
})
