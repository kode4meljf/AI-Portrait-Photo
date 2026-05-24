/**
 * 编辑客户面板（首页 customer-picker / 工作台客户列表共用）
 */
const app = getApp()
const { callCustomer } = require('../../utils/storeSession')
const { initialFromName, pickAvatarTint } = require('../../utils/customerListDisplay')
const { validateStoreCustomerForm, showCustomerPhoneError } = require('../../utils/customerForm')
const { canShowDeleteCustomer, confirmDeleteCustomer } = require('../../utils/customerDelete')

function avatarMetaFromCustomer(customer, id) {
  const nick = customer?.nickName || customer?.wxNickName || ''
  return {
    editAvatarUrl: customer?.avatarUrl || '',
    editAvatarInitial: customer?.avatarInitial || initialFromName(nick),
    editAvatarTint: customer?.avatarTint || pickAvatarTint(id || nick)
  }
}

Component({
  properties: {
    /** page：整页；sheet：弹层内 */
    embed: {
      type: String,
      value: 'sheet'
    },
    customerId: {
      type: String,
      value: '',
      observer(id) {
        if (id) this.loadCustomer(id)
      }
    }
  },

  data: {
    editForm: { nickName: '', phone: '', remark: '' },
    editSnapshot: { nickName: '', phone: '', remark: '' },
    editAvatarUrl: '',
    editAvatarInitial: '客',
    editAvatarTint: '#4e7cf6',
    editWxNickName: '',
    editPhoneLocked: false,
    editChanged: false,
    editCanSave: false,
    editSaving: false,
    editCanDelete: false,
    editDeleting: false,
    customerRaw: null
  },

  methods: {
    async loadCustomer(id) {
      if (!id) return
      try {
        const res = await wx.cloud.database().collection('customers').doc(id).get()
        const customer = res.data
        if (!customer) throw new Error('not found')
        const nickName = customer.nickName || ''
        const phone = customer.phone || ''
        const remark = customer.remark || ''
        const snapshot = { nickName, phone, remark }
        this.setData({
          editWxNickName: (customer.wxNickName || '').trim(),
          editPhoneLocked: !!(customer.wxOpenId || '').trim(),
          editForm: { ...snapshot },
          editSnapshot: { ...snapshot },
          ...avatarMetaFromCustomer(customer, id),
          editChanged: false,
          editCanSave: false,
          editSaving: false,
          editDeleting: false,
          customerRaw: customer,
          editCanDelete: canShowDeleteCustomer(customer, app)
        })
      } catch (err) {
        console.error('[customer-edit-panel] load failed', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.triggerEvent('back')
      }
    },

    onBack() {
      wx.hideKeyboard()
      this.triggerEvent('back')
    },

    onEditInput(e) {
      const key = e.currentTarget.dataset.key
      const value = e.detail.value || ''
      const editForm = { ...this.data.editForm, [key]: value }
      const { editSnapshot } = this.data
      const editChanged =
        editForm.nickName !== editSnapshot.nickName ||
        editForm.phone !== editSnapshot.phone ||
        editForm.remark !== editSnapshot.remark
      const valid = validateStoreCustomerForm(editForm)
      const patch = { editForm, editChanged, editCanSave: editChanged && valid.ok }
      if (key === 'nickName') {
        patch.editAvatarInitial = initialFromName(value)
      }
      this.setData(patch)
    },

    async onSave() {
      const id = this.properties.customerId
      if (this.data.editSaving || !this.data.editCanSave || !id) return

      const valid = validateStoreCustomerForm(this.data.editForm)
      if (!valid.ok) {
        wx.showToast({ title: valid.error, icon: 'none' })
        return
      }

      this.setData({ editSaving: true })
      try {
        const latest = await callCustomer('updateByStore', {
          customerDocId: id,
          nickName: valid.nickName,
          phone: valid.phone,
          remark: valid.remark
        })
        if (app.globalData.selectedCustomerId === id) {
          app.globalData.selectedCustomer = latest
        }
        wx.showToast({ title: '保存成功', icon: 'success' })
        this.triggerEvent('saved', { customer: latest })
      } catch (err) {
        if (showCustomerPhoneError(err)) return
        console.error('[customer-edit-panel] save failed', err)
        wx.showToast({ title: err.message || '保存失败', icon: 'none' })
      } finally {
        this.setData({ editSaving: false })
      }
    },

    async onDelete() {
      const id = this.properties.customerId
      if (this.data.editDeleting || !this.data.editCanDelete || !this.data.customerRaw || !id) return
      const confirmed = await confirmDeleteCustomer(this.data.customerRaw)
      if (!confirmed) return

      this.setData({ editDeleting: true })
      try {
        await callCustomer('deleteByStore', { customerDocId: id })
        if (app.globalData.selectedCustomerId === id) {
          app.globalData.selectedCustomerId = null
          app.globalData.selectedCustomer = null
          wx.removeStorageSync('selectedCustomerId')
        }
        wx.showToast({ title: '已删除', icon: 'success' })
        this.triggerEvent('deleted', { customerId: id })
      } catch (err) {
        wx.showToast({ title: err.message || '删除失败', icon: 'none' })
      } finally {
        this.setData({ editDeleting: false })
      }
    }
  }
})
