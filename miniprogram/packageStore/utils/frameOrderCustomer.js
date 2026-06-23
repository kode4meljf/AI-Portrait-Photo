/** 摆台下单：解析应关联的客户 ID（云相册批次 / 筛选 / 首页拍摄） */

function resolveFrameOrderCustomerId(app, pendingFrameOrder) {
  if (!app) app = getApp()
  const candidates = [
    pendingFrameOrder && pendingFrameOrder.customerId,
    app.globalData.selectedCustomerId,
    app.globalData.galleryFilterCustomerId
  ]
  for (const id of candidates) {
    const s = id != null ? String(id).trim() : ''
    if (s) return s
  }
  return null
}

module.exports = { resolveFrameOrderCustomerId }
