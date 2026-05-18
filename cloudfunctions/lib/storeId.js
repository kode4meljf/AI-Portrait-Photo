/** 门店业务 ID：仅认 store_ 前缀 */
const STORE_ID_RE = /^store_[a-z0-9]{8,32}$/i

function isValidStoreId(storeId) {
  return typeof storeId === 'string' && STORE_ID_RE.test(storeId.trim())
}

function generateStoreId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `store_${rand}${Date.now().toString(36).slice(-4)}`
}

function generateCustomerId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `cust_${rand}${Date.now().toString(36).slice(-4)}`
}

function generateInviteToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
}

module.exports = {
  STORE_ID_RE,
  isValidStoreId,
  generateStoreId,
  generateCustomerId,
  generateInviteToken
}
