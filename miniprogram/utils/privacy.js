/** 微信用户隐私保护指引（基础库 2.32.3+） */

function getPrivacyState(app) {
  if (!app.globalData.privacy) {
    app.globalData.privacy = { show: false, resolve: null, listeners: [] }
  }
  return app.globalData.privacy
}

function notifyPrivacyListeners(app) {
  const state = getPrivacyState(app)
  ;(state.listeners || []).forEach((fn) => {
    try {
      fn(state.show)
    } catch (e) {
      console.error('[privacy] listener', e)
    }
  })
}

function initPrivacyAuthorization(app) {
  const state = getPrivacyState(app)
  if (state.inited) return
  state.inited = true

  if (typeof wx.onNeedPrivacyAuthorization !== 'function') return

  wx.onNeedPrivacyAuthorization((resolve) => {
    state.resolve = resolve
    state.show = true
    notifyPrivacyListeners(app)
  })
}

function subscribePrivacyShow(app, listener) {
  const state = getPrivacyState(app)
  if (typeof listener === 'function') {
    state.listeners.push(listener)
  }
  return () => {
    state.listeners = state.listeners.filter((fn) => fn !== listener)
  }
}

function agreePrivacyAuthorization(app) {
  const state = getPrivacyState(app)
  if (typeof state.resolve === 'function') {
    state.resolve({ event: 'agree', buttonId: 'privacy-agree-btn' })
  }
  state.resolve = null
  state.show = false
  notifyPrivacyListeners(app)
}

function rejectPrivacyAuthorization(app) {
  const state = getPrivacyState(app)
  state.resolve = null
  state.show = false
  notifyPrivacyListeners(app)
}

function openPrivacyContract() {
  if (typeof wx.openPrivacyContract === 'function') {
    wx.openPrivacyContract({ fail: () => {} })
    return
  }
  wx.showToast({ title: '请在微信中打开隐私政策', icon: 'none' })
}

function getPrivacySetting() {
  return new Promise((resolve) => {
    if (typeof wx.getPrivacySetting !== 'function') {
      resolve({ needAuthorization: false, privacyContractName: '隐私保护指引' })
      return
    }
    wx.getPrivacySetting({
      success: resolve,
      fail: () => resolve({ needAuthorization: false, privacyContractName: '隐私保护指引' })
    })
  })
}

function requirePrivacyAuthorize() {
  return new Promise((resolve, reject) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      resolve()
      return
    }
    wx.requirePrivacyAuthorize({ success: resolve, fail: reject })
  })
}

async function ensurePrivacyAuthorized() {
  const setting = await getPrivacySetting()
  if (!setting.needAuthorization) return true
  await requirePrivacyAuthorize()
  return true
}

module.exports = {
  initPrivacyAuthorization,
  subscribePrivacyShow,
  agreePrivacyAuthorization,
  rejectPrivacyAuthorization,
  openPrivacyContract,
  getPrivacySetting,
  requirePrivacyAuthorize,
  ensurePrivacyAuthorized
}
