/**
 * 订单列表封面：类型判定、缩略图、角标文案
 */
const PLACEHOLDER = '/assets/icons/album-placeholder.png'

function resolveOrderType(order) {
  if (!order) return 'frame'
  if (order.orderType === 'album') return 'album'
  const name = (order.frameName || order.albumName || '').trim()
  if (name.includes('写真集') || name.includes('相册')) return 'album'
  return 'frame'
}

function resolveOrderThumbUrl(order, orderType) {
  const legacyPhoto = Array.isArray(order.photos) ? order.photos[0] : ''
  const photoUrls = Array.isArray(order.photoUrls) ? order.photoUrls : []
  if (orderType === 'album') {
    return (
      (order.photoUrl || photoUrls[0] || legacyPhoto || '').trim() || PLACEHOLDER
    )
  }
  return (order.photoUrl || legacyPhoto || '').trim() || PLACEHOLDER
}

function resolveThumbLabel(orderType) {
  return orderType === 'album' ? '影集' : '摆台'
}

function buildOrderCardThumb(order) {
  const orderType = resolveOrderType(order)
  return {
    orderType,
    thumbVariant: orderType,
    photoThumb: resolveOrderThumbUrl(order, orderType),
    thumbLabel: resolveThumbLabel(orderType)
  }
}

module.exports = {
  PLACEHOLDER,
  resolveOrderType,
  resolveOrderThumbUrl,
  resolveThumbLabel,
  buildOrderCardThumb
}
