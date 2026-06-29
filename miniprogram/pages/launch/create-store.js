const { callStoreMember, applySessionToApp } = require('../../utils/storeSession')
const { clearSessionDirty } = require('../../utils/sessionDirty')
const { normalizeMobilePhone } = require('../../utils/phone')
const { auditPageLayout } = require('../../utils/pageLayoutGuard')

Page({
  behaviors: [require('../../behaviors/pageShare')],
  data: {
    name: '',
    contactName: '',
    contactPhone: '',
    address: '',
    addressName: '',
    addressDetail: '',
    distanceText: '',
    houseNumber: '',
    latitude: null,
    longitude: null,
    submitting: false,
    nameCheckStatus: '',
    nameCheckHint: '',
    phoneCheckHint: ''
  },

  onReady() {
    auditPageLayout(this, {
      pageRoute: 'pages/launch/create-store',
      selectors: ['.create-page', '.create-page-body', '.section-card']
    })
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    let value = e.detail.value || ''
    if (key === 'contactPhone') {
      value = String(value).replace(/\D/g, '').slice(0, 11)
    }
    this.setData({ [key]: value })
    if (key === 'name') {
      this.setData({ nameCheckStatus: '', nameCheckHint: '' })
    }
    if (key === 'contactPhone') {
      this.setData({ phoneCheckHint: '' })
    }
  },

  onNameBlur(e) {
    this.runNameCheck((e.detail.value || '').trim())
  },

  async runNameCheck(name) {
    const trimmed = (name || this.data.name || '').trim()
    if (!trimmed) {
      this.setData({ nameCheckStatus: '', nameCheckHint: '' })
      return
    }
    this.setData({ nameCheckStatus: 'checking', nameCheckHint: '' })
    try {
      const res = await callStoreMember('store.checkName', { name: trimmed })
      if (res.available) {
        this.setData({ nameCheckStatus: 'ok', nameCheckHint: '' })
      } else {
        this.setData({
          nameCheckStatus: 'dup',
          nameCheckHint: res.reason || '该门店名称已被使用，请换一个名称'
        })
      }
    } catch (e) {
      this.setData({ nameCheckStatus: '', nameCheckHint: '' })
    }
  },

  chooseAddressOnMap() {
    wx.chooseLocation({
      success: (res) => {
        const name = (res.name || '').trim()
        const addr = (res.address || '').trim()
        const mapRaw = (res.detailInfo || '').trim()
        const distanceText = (res.distance || '').trim()
        const mapAddress = addr || name || mapRaw

        this.setData({
          address: mapAddress,
          addressName: name || mapAddress,
          addressDetail: mapRaw || addr || mapAddress,
          distanceText,
          latitude: typeof res.latitude === 'number' ? res.latitude : null,
          longitude: typeof res.longitude === 'number' ? res.longitude : null
        })
      },
      fail: (err) => {
        const msg = err && err.errMsg ? String(err.errMsg) : ''
        if (msg.indexOf('cancel') !== -1) return
        wx.showToast({ title: '未能打开选点', icon: 'none' })
      }
    })
  },

  validateForm() {
    const name = (this.data.name || '').trim()
    const contactName = (this.data.contactName || '').trim()
    const contactPhone = (this.data.contactPhone || '').trim()
    const mapAddress = (this.data.address || '').trim()

    if (!name) {
      wx.showToast({ title: '请填写门店名称', icon: 'none' })
      return false
    }
    if (this.data.nameCheckStatus === 'checking') {
      wx.showToast({ title: '正在检查名称…', icon: 'none' })
      return false
    }
    if (this.data.nameCheckStatus === 'dup') {
      wx.showToast({
        title: this.data.nameCheckHint || '该门店名称已被使用',
        icon: 'none'
      })
      return false
    }
    if (!contactName) {
      wx.showToast({ title: '请填写联系人', icon: 'none' })
      return false
    }
    const phoneResult = normalizeMobilePhone(contactPhone)
    if (!phoneResult.ok) {
      this.setData({ phoneCheckHint: phoneResult.error })
      wx.showToast({ title: phoneResult.error, icon: 'none' })
      return false
    }
    if (!mapAddress) {
      wx.showToast({ title: '请先地图选点', icon: 'none' })
      return false
    }
    if (typeof this.data.latitude !== 'number' || typeof this.data.longitude !== 'number') {
      wx.showToast({ title: '请通过地图选择地址', icon: 'none' })
      return false
    }
    return true
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.validateForm()) return

    this.setData({ submitting: true })
    try {
      const app = getApp()
      await app.ensureLogin()

      const mapAddress = (this.data.address || '').trim()
      const houseNumber = (this.data.houseNumber || '').trim()
      const fullAddress = [mapAddress, houseNumber].filter(Boolean).join(' ')
      const phoneNorm = normalizeMobilePhone((this.data.contactPhone || '').trim())

      const created = await callStoreMember('store.create', {
        name: (this.data.name || '').trim(),
        contactName: (this.data.contactName || '').trim(),
        contactPhone: phoneNorm.phone,
        address: fullAddress,
        mapAddress,
        addressName: (this.data.addressName || '').trim(),
        addressDetail: (this.data.addressDetail || '').trim(),
        distanceText: (this.data.distanceText || '').trim(),
        houseNumber,
        latitude: this.data.latitude,
        longitude: this.data.longitude
      })

      const storeDocId = created && (created._id || created.storeId)
      if (storeDocId) {
        app.globalData.storeId = storeDocId
        app.globalData.storeName = created.name || this.data.name
        app.globalData.storeRole = 'owner'
      }

      const account = await applySessionToApp(app)
      if (!account.canUseStore) {
        throw new Error('门店已创建，但成员状态异常，请返回上一页刷新')
      }

      clearSessionDirty(app)
      wx.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 400)
    } catch (e) {
      console.error('[create-store]', e)
      wx.showModal({
        title: '创建失败',
        content: e.message || '请稍后重试',
        showCancel: false
      })
    } finally {
      this.setData({ submitting: false })
    }
  }
})
