const STORE_ID_RE = /^store_[a-z0-9]{8,32}$/i

function isValidStoreId(storeId) {
  return typeof storeId === 'string' && STORE_ID_RE.test(storeId.trim())
}

function generateCustomerId() {
  const rand = Math.random().toString(36).slice(2, 10)
  return `cust_${rand}${Date.now().toString(36).slice(-4)}`
}

module.exports = {
  isValidStoreId,
  generateCustomerId
}
