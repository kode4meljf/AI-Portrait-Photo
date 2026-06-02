const cloud = require('wx-server-sdk')
const kuaidi = require('./kuaidi100')

const db = cloud.database()
const CACHE_TTL_TRANSIT_MS = 15 * 60 * 1000
const CACHE_TTL_DONE_MS = 60 * 60 * 1000

function phoneTail4(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}

function cacheTtlMs(order, cache) {
  if (order.status === '已完成') return CACHE_TTL_DONE_MS
  if (cache && (cache.state === '3' || cache.state === '4')) return CACHE_TTL_DONE_MS
  return CACHE_TTL_TRANSIT_MS
}

function isCacheFresh(order) {
  const cache = order.logisticsCache
  if (!cache || !cache.fetchedAt) return false
  const fetched = new Date(cache.fetchedAt).getTime()
  if (Number.isNaN(fetched)) return false
  return Date.now() - fetched < cacheTtlMs(order, cache)
}

function cacheToResult(cache) {
  if (!cache) return null
  return {
    companyCode: cache.com || '',
    companyName: cache.companyName || '',
    state: cache.state || '',
    traces: Array.isArray(cache.traces) ? cache.traces : [],
    empty: !!cache.empty,
    message: cache.message || '',
    fetchedAt: cache.fetchedAt || null
  }
}

async function saveLogisticsCache(orderId, payload) {
  await db.collection('frame_orders').doc(orderId).update({
    data: {
      logisticsCache: {
        ...payload,
        fetchedAt: db.serverDate()
      }
    }
  })
}

async function resolveLogistics(order, { phone, force = false } = {}) {
  const shippingNo = String(order.shippingNo || '').trim()
  if (!shippingNo) {
    return { empty: true, message: '暂无运单号', traces: [] }
  }

  if (!force && isCacheFresh(order)) {
    return cacheToResult(order.logisticsCache)
  }

  const query = await kuaidi.queryTracking({
    com: order.shippingCom || '',
    num: shippingNo,
    phoneTail4: phoneTail4(phone)
  })

  if (!query.ok) {
    const cachePayload = {
      com: query.com || order.shippingCom || '',
      companyName: query.companyName || order.shippingCompanyName || '',
      state: query.state || '',
      traces: [],
      empty: true,
      message: query.message || '暂无物流信息'
    }
    if (!query.skipCache) {
      await saveLogisticsCache(order._id, cachePayload)
    }
    if (query.com && query.com !== order.shippingCom) {
      await db.collection('frame_orders').doc(order._id).update({
        data: {
          shippingCom: query.com,
          shippingCompanyName: query.companyName || order.shippingCompanyName || ''
        }
      })
    }
    return cacheToResult(cachePayload)
  }

  const cachePayload = {
    com: query.com,
    companyName: query.companyName,
    state: query.state,
    traces: query.traces,
    empty: false,
    message: ''
  }
  await saveLogisticsCache(order._id, cachePayload)

  const orderPatch = {}
  if (query.com && query.com !== order.shippingCom) orderPatch.shippingCom = query.com
  if (query.companyName && query.companyName !== order.shippingCompanyName) {
    orderPatch.shippingCompanyName = query.companyName
  }
  if (Object.keys(orderPatch).length) {
    await db.collection('frame_orders').doc(order._id).update({ data: orderPatch })
  }

  return cacheToResult(cachePayload)
}

function invalidateLogisticsFields() {
  return {
    logisticsCache: db.command.remove()
  }
}

module.exports = {
  resolveLogistics,
  invalidateLogisticsFields,
  phoneTail4
}
