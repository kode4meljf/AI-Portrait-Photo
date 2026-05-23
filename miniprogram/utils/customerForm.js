const { normalizeMobilePhone } = require('./phone')

function validateStoreCustomerForm(form) {
  const nickName = (form.nickName || '').trim()
  if (!nickName) {
    return { ok: false, error: '请填写客户称呼' }
  }
  const phoneResult = normalizeMobilePhone(form.phone)
  if (!phoneResult.ok) {
    return { ok: false, error: phoneResult.error }
  }
  return {
    ok: true,
    nickName,
    phone: phoneResult.phone,
    remark: (form.remark || '').trim()
  }
}

function showPhoneConflictModal(err, options = {}) {
  const existingId = err.existingId || ''
  wx.showModal({
    title: options.title || '手机号已存在',
    content: err.message || '该手机号已被其他客户使用',
    confirmText: existingId ? '查看该客户' : '知道了',
    showCancel: !!existingId,
    cancelText: '知道了',
    success: (res) => {
      if (res.confirm && existingId) {
        wx.navigateTo({
          url: `/packageStore/pages/profile/customer-edit/customer-edit?id=${existingId}`
        })
      }
    }
  })
}

function showRegisteredPhoneModal(err, options = {}) {
  wx.showModal({
    title: options.title || '无法使用该手机号',
    content: err.message || '该手机号已是其他门店注册客户',
    showCancel: false,
    confirmText: '知道了'
  })
}

function showCustomerPhoneError(err, options = {}) {
  if (err && err.code === 'PHONE_REGISTERED_ELSEWHERE') {
    showRegisteredPhoneModal(err, options)
    return true
  }
  if (err && err.code === 'PHONE_ALREADY_EXISTS') {
    showPhoneConflictModal(err, options)
    return true
  }
  return false
}

module.exports = {
  validateStoreCustomerForm,
  showPhoneConflictModal,
  showRegisteredPhoneModal,
  showCustomerPhoneError
}
