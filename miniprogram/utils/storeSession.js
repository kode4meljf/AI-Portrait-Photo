/**
 * 门店会话：仅认 store_xxx
 * - stores 主档：文档 _id = store_xxx（正文不写 storeId）
 * - 关联表 / 会话：字段 storeId = 指向 stores._id 的外键
 */

function isValidStoreId(storeId) {
  return typeof storeId === 'string' && /^store_[a-z0-9]{8,32}$/i.test(storeId)
}

function unwrapFunctionResult(res) {
  let payload = res && res.result
  if (payload && typeof payload === 'object' && payload.result && payload.success === undefined) {
    payload = payload.result
  }
  return payload || {}
}

function throwCloudBizError(result) {
  const err = new Error(result.error || result.errMsg || '操作失败')
  if (result.code) err.code = result.code
  if (result.existingId) err.existingId = result.existingId
  if (result.storeName) err.storeName = result.storeName
  throw err
}

function parseCloudResult(res, fallbackName) {
  if (!res) {
    throw new Error(`${fallbackName || '云函数'}无响应`)
  }
  const errMsg = res.errMsg || ''
  if (errMsg && !errMsg.includes('ok')) {
    if (errMsg.includes('FUNCTION_NOT_FOUND') || errMsg.includes('-501000')) {
      throw new Error(`未找到云函数 ${fallbackName}，请在开发者工具中上传部署`)
    }
    throw new Error(errMsg)
  }
  const result = unwrapFunctionResult(res)
  if (result.success === false) {
    throwCloudBizError(result)
  }
  if (result.success !== true && result.error) {
    throwCloudBizError(result)
  }
  if (result.success === true) {
    return result.data
  }
  return result.data
}

async function resolveAccount() {
  const res = await wx.cloud.callFunction({
    name: 'storeMember',
    data: { action: 'account.resolve' }
  })
  return parseCloudResult(res, 'storeMember')
}

async function applySessionToApp(app) {
  const data = await resolveAccount()
  const accountKind = data.accountKind || (data.canUseStore ? 'store' : 'none')

  app.globalData.membership = data
  app.globalData.accountKind = accountKind
  app.globalData.storeId = accountKind === 'store' && data.canUseStore ? data.storeId : null
  app.globalData.storeRole = data.role || null
  app.globalData.storeName = data.storeName || ''
  app.globalData.customer = accountKind === 'customer' ? data.customer || null : null
  app.globalData.customerDocId =
    accountKind === 'customer' ? data.customerDocId || data.customer?._id || null : null

  if (accountKind !== 'store') {
    app.globalData.selectedCustomerId = null
    app.globalData.selectedCustomer = null
  }

  return data
}

function callStoreMember(action, data = {}) {
  return wx.cloud
    .callFunction({ name: 'storeMember', data: { action, ...data } })
    .then((res) => parseCloudResult(res, 'storeMember'))
}

/** 写门店档案走云函数（stores 为「仅创建者可写」时，云函数创建的文档需由此更新） */
function updateStoreProfile(data) {
  return callStoreMember('store.update', data)
}

function callCustomer(action, data = {}) {
  return wx.cloud
    .callFunction({ name: 'customer', data: { action, ...data } })
    .then((res) => parseCloudResult(res, 'customer'))
}

module.exports = {
  isValidStoreId,
  resolveAccount,
  applySessionToApp,
  callStoreMember,
  updateStoreProfile,
  callCustomer
}
