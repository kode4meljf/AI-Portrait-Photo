/**
 * 顾客端订单列表展示（方案 A：成片卡片）
 */
const { PLACEHOLDER_THUMB } = require('../../utils/frameOrderDetailView')

const STATUS_FLOW = ['待处理', '制作中', '已发货', '已完成']
const PROGRESS_WIDTH = ['25%', '50%', '75%', '100%']

function statusClassFor(status) {
  switch (status) {
    case '制作中':
      return 'producing'
    case '已发货':
      return 'shipped'
    case '已完成':
      return 'done'
    default:
      return 'pending'
  }
}

function stepIndexFor(status) {
  if (status === '已完成') return 3
  const i = STATUS_FLOW.indexOf(status)
  return i >= 0 ? i : 0
}

/**
 * @param {object} order
 * @param {(date: *) => string} formatTime 返回 MM-dd HH:mm
 */
function formatCustomerOrderRow(order, formatTime) {
  const status = order.status || '待处理'
  const legacyPhoto = Array.isArray(order.photos) ? order.photos[0] : ''
  const thumb = (order.photoUrl || legacyPhoto || '').trim() || PLACEHOLDER_THUMB
  const createTimeStr = formatTime(order.createTime)
  const orderNo = (order.orderNo || '').trim()
  const metaLine =
    orderNo && createTimeStr ? `${orderNo} · ${createTimeStr}` : orderNo || createTimeStr

  return {
    ...order,
    photoThumb: thumb,
    frameTitle: (order.frameName || '').trim() || '写真摆台',
    styleLine: (order.styleName || '').trim() ? `风格 · ${order.styleName.trim()}` : '',
    metaLine,
    statusClass: statusClassFor(status),
    statusText: status,
    progressWidth: PROGRESS_WIDTH[stepIndexFor(status)] || '0%',
    progressSteps: STATUS_FLOW
  }
}

function calcOrderSummary(orders) {
  const summary = {
    total: orders.length,
    pending: 0,
    producing: 0,
    shipped: 0,
    done: 0
  }
  ;(orders || []).forEach((o) => {
    const s = o.status || '待处理'
    if (s === '待处理') summary.pending += 1
    else if (s === '制作中') summary.producing += 1
    else if (s === '已发货') summary.shipped += 1
    else if (s === '已完成') summary.done += 1
  })
  return summary
}

module.exports = {
  formatCustomerOrderRow,
  calcOrderSummary
}
