/** 门店成员角色（与 account.resolve 的 role 一致） */

function isStoreOwner(app) {
  try {
    const target = app || getApp()
    return target.globalData.storeRole === 'owner'
  } catch (_) {
    return false
  }
}

module.exports = { isStoreOwner }
