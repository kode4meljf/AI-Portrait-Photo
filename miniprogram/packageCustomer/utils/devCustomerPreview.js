/** 开发者工具预览客户端：仅 develop / trial 生效，正式版忽略 */

const STORAGE_KEY = 'DEV_PREVIEW_CUSTOMER'

function isDevelopEnv() {
  try {
    const env = wx.getAccountInfoSync().miniProgram.envVersion
    return env === 'develop' || env === 'trial'
  } catch (_) {
    return false
  }
}

function isTruthyFlag(v) {
  const s = String(v || '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes'
}

/** 编译模式启动参数 devPreview=1 时调用（页面 onLoad） */
function activateFromOptions(options) {
  if (!isDevelopEnv()) return
  if (!isTruthyFlag(options && (options.devPreview || options.devCustomer))) return
  const app = getApp()
  app.globalData.devPreviewCustomer = true
  wx.setStorageSync(STORAGE_KEY, '1')
}

function isDevCustomerPreview() {
  if (!isDevelopEnv()) return false
  const app = getApp()
  return !!(app.globalData.devPreviewCustomer || wx.getStorageSync(STORAGE_KEY))
}

function getMockCustomerProfile() {
  const { buildCheckinQrPayload } = require('./checkinQr')
  const row = {
    _id: 'dev_preview',
    customerId: 'C_DEV_PREVIEW',
    wxNickName: '预览顾客',
    phone: '13800138000',
    storeName: '演示写真馆',
    totalCheckins: 2,
    equityAlbum: 5,
    equityFrame: 1,
    avatarUrl: '',
    wxOpenId: ''
  }
  row.qrPayload = buildCheckinQrPayload(row, '')
  return row
}

module.exports = {
  activateFromOptions,
  isDevCustomerPreview,
  getMockCustomerProfile
}
