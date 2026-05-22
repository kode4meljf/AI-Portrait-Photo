const STORE_ID_RE = /^store_[a-z0-9]{8,32}$/i

function isValidStoreId(storeId) {
  return typeof storeId === 'string' && STORE_ID_RE.test(storeId.trim())
}

module.exports = {
  isValidStoreId
}
