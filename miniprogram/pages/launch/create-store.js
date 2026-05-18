const { callStoreMember, applySessionToApp } = require('../../utils/storeSession')

Page({
  data: {
    name: 'AI写真馆',
    contactName: '',
    contactPhone: '',
    address: '',
    submitting: false
  },

  onInput(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: e.detail.value })
  },

  async onSubmit() {
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const app = getApp()
      await app.ensureLogin()

      const created = await callStoreMember('store.create', {
        name: this.data.name,
        contactName: this.data.contactName,
        contactPhone: this.data.contactPhone,
        address: this.data.address
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

      wx.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/index/index' })
      }, 400)
      console.log('[create-store] ok', storeDocId)
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
