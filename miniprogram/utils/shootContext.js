/**
 * 拍摄流程中的客户会话：首页关联后贯穿风格选择与生成
 */
const { getCustomerDisplayName } = require('./customerDisplay')

const STORAGE_KEY = 'selectedCustomerId'

function applyShootCustomer(app, customer) {
  if (!app) return
  if (!customer || !customer._id) {
    clearShootCustomer(app)
    return
  }
  app.globalData.selectedCustomerId = customer._id
  app.globalData.selectedCustomer = customer
  wx.setStorageSync(STORAGE_KEY, customer._id)
}

function clearShootCustomer(app) {
  if (!app) return
  app.globalData.selectedCustomerId = null
  app.globalData.selectedCustomer = null
  wx.removeStorageSync(STORAGE_KEY)
}

/** 仅当前会话在首页显式关联的客户，不读本地缓存（避免无关联时误带上次客户） */
function getShootCustomerId(app) {
  if (!app) app = getApp()
  return app.globalData.selectedCustomerId || ''
}

function getShootCustomerDisplayName(app) {
  if (!app) app = getApp()
  const customer = app.globalData.selectedCustomer
  if (customer) return getCustomerDisplayName(customer)
  return ''
}

function syncShootCustomerFromQuery(app, customerId) {
  if (!app || !customerId) return
  if (customerId === app.globalData.selectedCustomerId) return
  app.globalData.selectedCustomerId = customerId
  wx.setStorageSync(STORAGE_KEY, customerId)
}

/** @param {Record<string, string|number>} params 值为未编码的原始字符串 */
function buildShootQuery(params = {}) {
  const app = getApp()
  const entries = { ...params }
  const customerId = getShootCustomerId(app)
  if (customerId && !entries.customerId) {
    entries.customerId = customerId
  }
  return Object.keys(entries)
    .filter((key) => entries[key] != null && entries[key] !== '')
    .map((key) => `${key}=${encodeURIComponent(String(entries[key]))}`)
    .join('&')
}

module.exports = {
  applyShootCustomer,
  clearShootCustomer,
  getShootCustomerId,
  getShootCustomerDisplayName,
  buildShootQuery
}
