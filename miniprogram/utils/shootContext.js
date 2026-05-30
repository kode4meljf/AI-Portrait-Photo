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

const PENDING_SHOOT_TTL_MS = 10 * 60 * 1000

/** 风格列表经 URL 传递易被超长 originalUrl 截断，改走内存 */
function setPendingShoot(payload) {
  const app = getApp()
  app.globalData.pendingShoot = {
    ...payload,
    at: Date.now()
  }
}

function consumePendingShoot() {
  const app = getApp()
  const p = app.globalData.pendingShoot
  if (!p || Date.now() - (p.at || 0) > PENDING_SHOOT_TTL_MS) {
    app.globalData.pendingShoot = null
    return null
  }
  app.globalData.pendingShoot = null
  return p
}

/** @param {Record<string, string|number>} params 值为未编码的原始字符串 */
function buildShootQuery(params = {}) {
  const app = getApp()
  const customerId = getShootCustomerId(app)
  const parts = []
  const add = (key, val) => {
    if (val == null || val === '') return
    parts.push(`${key}=${encodeURIComponent(String(val))}`)
  }
  add('count', params.count)
  add('styleIds', params.styleIds)
  if (customerId && !params.customerId) add('customerId', customerId)
  add('originalUrl', params.originalUrl)
  return parts.join('&')
}

module.exports = {
  applyShootCustomer,
  clearShootCustomer,
  getShootCustomerId,
  getShootCustomerDisplayName,
  setPendingShoot,
  consumePendingShoot,
  buildShootQuery
}
