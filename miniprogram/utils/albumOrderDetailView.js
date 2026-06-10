const { buildFrameOrderView } = require('./frameOrderDetailView')

const PREVIEW_LIMIT = 6

function buildAlbumOrderView(order, options = {}) {
  const photoUrls = Array.isArray(order.photoUrls) ? order.photoUrls.filter(Boolean) : []
  const photoCount = Number(order.photoCount) || photoUrls.length
  const pointsCost = Number(order.pointsCost) || 0
  const previewPhotos = photoUrls.slice(0, PREVIEW_LIMIT).map((url, index) => ({ url, index }))
  const photoMoreCount = Math.max(0, photoUrls.length - PREVIEW_LIMIT)
  const status = order.status || '待处理'
  const audience = options.audience || 'store'
  const shippingNo = String(order.shippingNo || '').trim()

  const view = buildFrameOrderView(
    {
      ...order,
      photoUrl: order.photoUrl || photoUrls[0] || ''
    },
    options
  )

  if (status === '待处理') {
    view.heroSub =
      audience === 'customer'
        ? '门店确认后将开始制作，预计 5–7 个工作日'
        : `确认后将扣减 ${pointsCost} 积分并开始冲印装册，预计 5–7 个工作日`
  } else if (status === '制作中') {
    view.heroSub =
      audience === 'customer'
        ? '正在冲印装册，完成后将安排发货'
        : '正在冲印装册，完成后将录入快递单号并通知您'
  } else if (status === '已完成' && !shippingNo) {
    view.heroSub =
      audience === 'customer'
        ? '感谢您的耐心等待'
        : '感谢使用，欢迎带客户再次体验 AI 写真集'
  }

  const perPhoto =
    photoCount > 0 && pointsCost > 0 ? Math.round(pointsCost / photoCount) : 0

  return {
    ...view,
    isAlbumOrder: true,
    productName: order.albumName || order.frameName || '写真集',
    photoUrls,
    previewPhotos,
    photoMoreCount,
    photoCount,
    pointsCost,
    pointsCostLabel: `${pointsCost} 积分`,
    pointsPerPhotoHint: perPhoto > 0 ? `（${perPhoto} 点/张）` : ''
  }
}

module.exports = { buildAlbumOrderView, PREVIEW_LIMIT }
