const { db, _ } = require('./db')
const { getCustomerDisplayName } = require('./customerFormat')

function buildFrameSizeText(row) {
  if (!row) return ''
  if (row.sizeFirst != null && row.sizeSecond != null) {
    const u = row.sizeUnit || 'cm'
    return `${row.sizeFirst}${u} × ${row.sizeSecond}${u}`
  }
  return String(row.size || '').trim()
}

async function loadCustomerMap(customerIds) {
  const ids = [...new Set((customerIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const res = await db.collection('customers').where({ _id: _.in(ids) }).get()
  const map = {}
  ;(res.data || []).forEach((c) => {
    map[c._id] = c
  })
  return map
}

async function loadFrameTemplateMap(templateIds) {
  const ids = [...new Set((templateIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const res = await db.collection('frame_templates').where({ id: _.in(ids) }).get()
  const map = {}
  ;(res.data || []).forEach((t) => {
    map[t.id] = t
  })
  return map
}

function formatOrderRow(order, customerMap, frameTemplateMap) {
  const customer = order.customerId ? customerMap[order.customerId] : null
  const createTimeText = order.createTime
    ? new Date(order.createTime).toLocaleString('zh-CN')
    : ''
  const exportedAtText = order.exportedAt
    ? new Date(order.exportedAt).toLocaleString('zh-CN')
    : ''

  if (order.orderType === 'album') {
    return {
      ...order,
      orderType: 'album',
      orderTypeLabel: '影集',
      productName: order.albumName || order.frameName || '写真集',
      customerName: customer ? getCustomerDisplayName(customer) : '-',
      customerPhone: (customer?.phone || '').trim() || '',
      size: '-',
      material: '-',
      price: order.pointsCost != null ? `${order.pointsCost}积分` : '-',
      photoCount: order.photoCount || (order.photoUrls || []).length,
      createTimeText,
      exportedAtText
    }
  }

  const template = frameTemplateMap[order.frameTemplateId] || null
  return {
    ...order,
    orderType: 'frame',
    orderTypeLabel: '摆台',
    productName: template?.name || order.frameName || '-',
    frameName: template?.name || order.frameName || '-',
    frameCode: template?.id || order.frameTemplateId || '',
    customerName: customer ? getCustomerDisplayName(customer) : '-',
    customerPhone: (customer?.phone || '').trim() || '',
    size: buildFrameSizeText(template) || '-',
    material: template?.material || '-',
    price: '-',
    createTimeText,
    exportedAtText
  }
}

async function listMergedOrders(query) {
  const storeId = query.storeId
  if (!storeId) throw new Error('请选择门店 storeId')

  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20))
  const skip = (page - 1) * pageSize
  const fetchLimit = skip + pageSize

  const where = { storeId }
  if (query.status && query.status !== 'all') {
    where.status = query.status
  }

  const [frameRes, albumRes, frameCountRes, albumCountRes] = await Promise.all([
    db.collection('frame_orders').where(where).orderBy('createTime', 'desc').limit(fetchLimit).get(),
    db.collection('album_orders').where(where).orderBy('createTime', 'desc').limit(fetchLimit).get(),
    db.collection('frame_orders').where(where).count(),
    db.collection('album_orders').where(where).count()
  ])

  const merged = [
    ...(frameRes.data || []).map((o) => ({ ...o, orderType: 'frame' })),
    ...(albumRes.data || []).map((o) => ({ ...o, orderType: 'album' }))
  ].sort((a, b) => {
    const ta = a.createTime ? new Date(a.createTime).getTime() : 0
    const tb = b.createTime ? new Date(b.createTime).getTime() : 0
    return tb - ta
  })

  const pageRows = merged.slice(skip, skip + pageSize)
  const customerIds = pageRows.map((o) => o.customerId).filter(Boolean)
  const templateIds = pageRows
    .filter((o) => o.orderType === 'frame')
    .map((o) => o.frameTemplateId)
    .filter(Boolean)

  const [customerMap, frameTemplateMap] = await Promise.all([
    loadCustomerMap(customerIds),
    loadFrameTemplateMap(templateIds)
  ])

  const list = pageRows.map((order) => formatOrderRow(order, customerMap, frameTemplateMap))
  const total = (frameCountRes.total || 0) + (albumCountRes.total || 0)

  return { list, total, page, pageSize }
}

async function getMergedOrderStatusCounts(query) {
  const storeId = query.storeId
  if (!storeId) throw new Error('请选择门店 storeId')
  const base = { storeId }
  const counts = {}

  await Promise.all(
    ['待处理', '制作中', '已发货', '已完成'].map(async (status) => {
      const [frameRes, albumRes] = await Promise.all([
        db.collection('frame_orders').where({ ...base, status }).count(),
        db.collection('album_orders').where({ ...base, status }).count()
      ])
      counts[status] = (frameRes.total || 0) + (albumRes.total || 0)
    })
  )

  const all = Object.values(counts).reduce((a, b) => a + b, 0)
  return { all, ...counts }
}

module.exports = {
  listMergedOrders,
  getMergedOrderStatusCounts
}
