const cloud = require('wx-server-sdk')
const db = cloud.database()
const { resolveLogistics } = require('./orderLogistics')

async function getCustomerOrderLogistics(openid, payload) {
  const { getCustomerByOpenId } = require('./register')
  const row = await getCustomerByOpenId(openid)
  if (!row) throw new Error('您尚未注册为顾客')

  const orderId = payload.orderId
  if (!orderId) throw new Error('缺少 orderId')

  const res = await db.collection('frame_orders').doc(orderId).get()
  const order = res.data
  if (!order || order.customerId !== row._id) {
    throw new Error('订单不存在或无权查看')
  }

  const shippingNo = String(order.shippingNo || '').trim()
  if (!shippingNo) {
    return { logistics: { empty: true, message: '暂无运单号', traces: [] } }
  }

  const logistics = await resolveLogistics(order, {
    phone: row.phone || '',
    force: !!payload.force
  })
  return { logistics }
}

module.exports = { getCustomerOrderLogistics }
