/**
 * 门店会话：仅认 store_xxx
 * - stores 主档：文档 _id = store_xxx（正文不写 storeId）
 * - 关联表 / 会话：字段 storeId = 指向 stores._id 的外键
 */

function isValidStoreId(storeId) {
  return typeof storeId === 'string' && /^store_[a-z0-9]{8,32}$/i.test(storeId)
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
  const result = res.result || {}
  if (result.success === false) {
    throw new Error(result.error || '操作失败')
  }
  if (result.success !== true && result.error) {
    throw new Error(result.error)
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
  app.globalData.membership = data
  app.globalData.storeId = data.canUseStore ? data.storeId : null
  app.globalData.storeRole = data.role || null
  app.globalData.storeName = data.storeName || ''
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
    .then((res) => {
      try {
        return parseCloudResult(res, 'customer')
      } catch (e) {
        if (e.message) {
          const err = new Error(e.message)
          const result = res.result || {}
          err.code = result.code
          err.storeName = result.storeName
          throw err
        }
        throw e
      }
    })
}

module.exports = {
  isValidStoreId,
  resolveAccount,
  applySessionToApp,
  callStoreMember,
  updateStoreProfile,
  callCustomer
}
