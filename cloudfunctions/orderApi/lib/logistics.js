const cloud = require('wx-server-sdk')
const db = cloud.database()
const { resolveLogistics } = require('./orderLogistics')
const { ORDER_TYPES } = require('./config')

async function assertStoreOrder(orderId, storeId) {
  const res = await db.collection(ORDER_TYPES.frame.collection).doc(orderId).get()
  const order = res.data
  if (!order || order.storeId !== storeId) throw new Error('订单不存在或无权访问')
  return order
}

async function getFrameOrderLogistics(event, storeId) {
  const { orderId, force } = event
  if (!orderId) return { success: false, error: '缺少 orderId' }

  const order = await assertStoreOrder(orderId, storeId)
  const shippingNo = String(order.shippingNo || '').trim()
  if (!shippingNo) {
    return { success: true, logistics: { empty: true, message: '暂无运单号', traces: [] } }
  }

  let phone = ''
  if (order.customerId) {
    try {
      const cRes = await db.collection('customers').doc(order.customerId).get()
      phone = cRes.data?.phone || ''
    } catch (_) {
      /* ignore */
    }
  }

  const logistics = await resolveLogistics(order, { phone, force: !!force })
  return { success: true, logistics }
}

module.exports = { getFrameOrderLogistics }
