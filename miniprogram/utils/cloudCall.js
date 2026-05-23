/**
 * 统一云函数调用：校验 errMsg / success，并固定云环境 ID
 */
const { CLOUD_ENV_ID } = require('../config/cloudEnv')

function parseCloudResult(res, name) {
  if (!res) throw new Error(`${name || '云函数'}无响应`)
  const errMsg = res.errMsg || ''
  if (errMsg && !/ok|OK/.test(errMsg)) {
    throw new Error(errMsg)
  }
  const result = res.result
  if (!result || typeof result !== 'object') {
    throw new Error(`${name || '云函数'}返回格式异常，请确认已上传部署该云函数`)
  }
  if (result.success === false) {
    const err = new Error(result.error || '操作失败')
    err.code = result.code
    throw err
  }
  if (result.success !== true) {
    throw new Error(
      `${name || '云函数'}未返回 success，可能为旧版本未部署。请上传部署 ${name} 后重试`
    )
  }
  return result.data
}

function callCloudFunction(name, data = {}) {
  return wx.cloud
    .callFunction({
      name,
      data,
      config: { env: CLOUD_ENV_ID }
    })
    .then((res) => parseCloudResult(res, name))
}

module.exports = {
  CLOUD_ENV_ID,
  parseCloudResult,
  callCloudFunction
}
