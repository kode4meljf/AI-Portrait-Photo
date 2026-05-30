function isValidStoreId(storeId) {
  return typeof storeId === 'string' && /^store_[a-z0-9]{8,32}$/i.test(storeId);
}

module.exports = { isValidStoreId };
