/**
 * 顾客端云函数 customer
 */

function parseCloudResult(res, name) {
  if (!res) throw new Error(`${name || '云函数'}无响应`)
  const errMsg = res.errMsg || ''
  if (errMsg && !errMsg.includes('ok')) {
    throw new Error(errMsg)
  }
  const result = res.result || {}
  if (result.success === false) {
    const err = new Error(result.error || '操作失败')
    if (result.code) err.code = result.code
    if (result.existingId) err.existingId = result.existingId
    if (result.storeName) err.storeName = result.storeName
    throw err
  }
  return result.data
}

function callCustomer(action, data = {}) {
  return wx.cloud
    .callFunction({ name: 'customer', data: { action, ...data } })
    .then((res) => parseCloudResult(res, 'customer'))
}

module.exports = { callCustomer }
