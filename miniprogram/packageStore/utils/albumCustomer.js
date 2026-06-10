const { resolveFrameOrderCustomerId } = require('../../utils/frameOrderCustomer')

/** 制作影集：必须已关联客户（批次 / 云相册筛选 / 首页拍摄） */
function resolveLinkedCustomerId(app, extra = {}) {
  if (!app) app = getApp()
  const pending = extra.customerId ? { customerId: extra.customerId } : null
  return resolveFrameOrderCustomerId(app, pending)
}

module.exports = { resolveLinkedCustomerId }
