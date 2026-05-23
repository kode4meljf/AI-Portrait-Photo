const app = getApp()
const { ensureCustomerPage } = require('../../../utils/customerGuard')
const { applySessionToApp } = require('../../../utils/storeSession')
const {
  isDevCustomerPreview,
  getMockCustomerProfile
} = require('../../../utils/devCustomerPreview')
const { callCustomer } = require('../../../utils/customerApi')
const { getCustomerWxDisplayName } = require('../../../utils/customerDisplay')
const { CUSTOMER_BASE } = require('../../../utils/helpCenter')

const CUSTOMER_HOME = '/packageCustomer/pages/home/home'

function maskPhone(phone) {
  const p = (phone || '').trim()
  if (!p) return '未绑定'
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(-4)}`
  if (p.length >= 7) return `${p.slice(0, 3)}****${p.slice(-2)}`
  return p
}

function avatarInitialFromName(name) {
  const s = (name || '').trim()
  if (!s) return '我'
  return s.slice(0, 1)
}

function applyProfileToPage(page, profile) {
  const wxNickName = getCustomerWxDisplayName(profile)
  const phone = profile.phone || ''
  page.setData({
    profile,
    wxNickName,
    phone,
    phoneMasked: maskPhone(phone),
    storeName: profile.storeName || '',
    avatarInitial: avatarInitialFromName(wxNickName)
  })
}

Page({
  behaviors: [require('../../../behaviors/customerPageNav')],

  data: {
    profile: null,
    wxNickName: '微信用户',
    phone: '',
    phoneMasked: '未绑定',
    storeName: '',
    avatarInitial: '我',
    showNickModal: false,
    nickDraft: ''
  },

  async onShow() {
    const ok = await ensureCustomerPage(this)
    if (!ok) return
    await this.loadProfile()
  },

  async loadProfile() {
    try {
      if (isDevCustomerPreview()) {
        const account = await applySessionToApp(app)
        if (account.accountKind !== 'customer') {
          applyProfileToPage(this, getMockCustomerProfile())
          return
        }
      }
      const profile = await callCustomer('profile.get')
      app.globalData.customer = profile
      applyProfileToPage(this, profile)
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  preventMove() {},

  onGoHome() {
    wx.redirectTo({ url: CUSTOMER_HOME })
  },

  onOpenHelp() {
    wx.navigateTo({ url: `${CUSTOMER_BASE}/index` })
  },

  onOpenNickModal() {
    this.setData({
      showNickModal: true,
      nickDraft: this.data.wxNickName === '微信用户' ? '' : this.data.wxNickName
    })
  },

  onCloseNickModal() {
    this.setData({ showNickModal: false, nickDraft: '' })
  },

  onNickDraftInput(e) {
    this.setData({ nickDraft: e.detail.value || '' })
  },

  async onConfirmNick() {
    const nick = (this.data.nickDraft || '').trim()
    if (nick.length < 2 || nick.length > 20) {
      wx.showToast({ title: '昵称需为 2～20 字', icon: 'none' })
      return
    }
    if (nick === this.data.wxNickName) {
      this.onCloseNickModal()
      return
    }

    if (isDevCustomerPreview()) {
      const account = await applySessionToApp(app)
      if (account.accountKind !== 'customer') {
        const profile = { ...this.data.profile, wxNickName: nick }
        app.globalData.customer = profile
        applyProfileToPage(this, profile)
        this.onCloseNickModal()
        wx.showToast({ title: '已更新', icon: 'success' })
        return
      }
    }

    wx.showLoading({ title: '保存中' })
    try {
      const profile = await callCustomer('profile.update', { wxNickName: nick })
      app.globalData.customer = profile
      applyProfileToPage(this, profile)
      this.onCloseNickModal()
      wx.showToast({ title: '已更新', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onChooseAvatar(e) {
    const url = e.detail.avatarUrl
    if (!url) return
    this.setData({ 'profile.avatarUrl': url })
    this.uploadAvatarAndSave(url)
  },

  async uploadAvatarAndSave(tempPath) {
    wx.showLoading({ title: '保存中' })
    try {
      const ext = (tempPath.match(/\.(\w+)$/) || [])[1] || 'jpg'
      const cloudPath = `customer-avatars/${app.globalData.customerDocId || 'me'}_${Date.now()}.${ext}`
      const up = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath })
      const profile = await callCustomer('profile.update', { avatarUrl: up.fileID })
      app.globalData.customer = profile
      applyProfileToPage(this, profile)
      wx.showToast({ title: '已更新', icon: 'success' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async onChangePhone(e) {
    const phoneCode = e.detail.code
    if (!phoneCode) return
    wx.showLoading({ title: '更新中' })
    try {
      const profile = await callCustomer('profile.update', { phoneCode })
      app.globalData.customer = profile
      applyProfileToPage(this, profile)
      wx.showToast({
        title: '手机号已更新，请到首页刷新打卡码',
        icon: 'none',
        duration: 2800
      })
    } catch (err) {
      wx.showToast({ title: err.message || '授权失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})
