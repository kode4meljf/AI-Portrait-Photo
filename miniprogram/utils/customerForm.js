const { normalizeMobilePhone } = require('./phone')
const { normalizeGender, DEFAULT_GENDER } = require('./customerGender')

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
    remark: (form.remark || '').trim(),
    gender: normalizeGender(form.gender || DEFAULT_GENDER),
    address: (form.address || '').trim()
  }
}

function showPhoneConflictModal(err, options = {}) {
  const existingId = (err && err.existingId) || ''
  const content =
    (err && err.message) ||
    (typeof err === 'string' ? err : '') ||
    '该手机号在本店已有客户档案'
  const title = options.title || '手机号已存在'

  const openModal = () => {
    wx.showModal({
      title,
      content,
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

  wx.showToast({ title: content.slice(0, 28), icon: 'none', duration: 2200 })
  setTimeout(openModal, 80)
}

function showRegisteredPhoneModal(err, options = {}) {
  wx.showModal({
    title: options.title || '无法使用该手机号',
    content: err.message || '该手机号已在其他门店登记',
    showCancel: false,
    confirmText: '知道了'
  })
}

function showCustomerPhoneError(err, options = {}) {
  const msg = (err && err.message) || ''
  if (err && err.code === 'PHONE_REGISTERED_ELSEWHERE') {
    showRegisteredPhoneModal(err, options)
    return true
  }
  if (err && err.code === 'PHONE_ALREADY_EXISTS') {
    showPhoneConflictModal(err, options)
    return true
  }
  if (
    msg.includes('请勿重复建档') ||
    msg.includes('已有客户档案') ||
    msg.includes('无法更换为该号码')
  ) {
    showPhoneConflictModal(err, options)
    return true
  }
  if (
    msg.includes('已在其他门店登记') ||
    (msg.includes('已是') && msg.includes('注册客户'))
  ) {
    showRegisteredPhoneModal(err, options)
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
