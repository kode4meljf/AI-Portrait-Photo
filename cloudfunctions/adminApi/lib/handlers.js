const { login, verifyToken } = require('./auth')
const { db, _, ORDER_STATUSES, toDateString, parsePage } = require('./db')

async function listStores(query) {
  const { page, pageSize, skip } = parsePage(query)
  const keyword = (query.keyword || '').trim()
  let coll = db.collection('store_profile')
  if (keyword) {
    coll = coll.where(_.or([
      { name: db.RegExp({ regexp: keyword, options: 'i' }) },
      { contactPhone: db.RegExp({ regexp: keyword, options: 'i' }) },
      { contactName: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
  }
  const [listRes, countRes] = await Promise.all([
    coll.skip(skip).limit(pageSize).get(),
    coll.count()
  ])
  return {
    list: listRes.data.map((row) => ({ ...row, _id: row._id })),
    total: countRes.total,
    page,
    pageSize
  }
}

async function getStore(payload) {
  const storeId = payload.storeId || payload.id
  if (!storeId) throw new Error('缺少 storeId')
  const res = await db.collection('store_profile').doc(storeId).get()
  return res.data
}

async function updateStore(payload) {
  const storeId = payload.storeId || payload.id
  if (!storeId) throw new Error('缺少 storeId')
  const allowed = ['name', 'contactName', 'contactPhone', 'address', 'level', 'balance', 'packageTotal', 'packageUsed', 'packageExpireDate', 'avatarUrl']
  const data = {}
  allowed.forEach((key) => {
    if (payload[key] !== undefined) data[key] = payload[key]
  })
  if (!Object.keys(data).length) throw new Error('没有可更新字段')
  await db.collection('store_profile').doc(storeId).update({ data })
  return getStore({ storeId })
}

async function listCustomers(query) {
  const { page, pageSize, skip } = parsePage(query)
  const storeId = query.storeId
  const keyword = (query.keyword || '').trim()
  if (!storeId) throw new Error('请选择门店 storeId')

  let where = { storeId }
  if (keyword) {
    where = _.and([
      { storeId },
      _.or([
        { nickName: db.RegExp({ regexp: keyword, options: 'i' }) },
        { phone: db.RegExp({ regexp: keyword, options: 'i' }) }
      ])
    ])
  }

  const coll = db.collection('customers').where(where)
  const [listRes, countRes] = await Promise.all([
    coll.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get(),
    coll.count()
  ])
  return {
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize
  }
}

async function getCustomer(payload) {
  const id = payload.id || payload.customerId
  if (!id) throw new Error('缺少客户 id')
  const res = await db.collection('customers').doc(id).get()
  return res.data
}

async function updateCustomer(payload) {
  const id = payload.id || payload.customerId
  if (!id) throw new Error('缺少客户 id')
  const allowed = ['nickName', 'phone', 'remark', 'equityAlbum', 'equityFrame', 'avatarUrl']
  const data = {}
  allowed.forEach((key) => {
    if (payload[key] !== undefined) data[key] = payload[key]
  })
  if (!Object.keys(data).length) throw new Error('没有可更新字段')
  await db.collection('customers').doc(id).update({ data })
  return getCustomer({ id })
}

async function listOrders(query) {
  const { page, pageSize, skip } = parsePage(query)
  const storeId = query.storeId
  if (!storeId) throw new Error('请选择门店 storeId')

  const where = { storeId }
  if (query.status && query.status !== 'all') {
    where.status = query.status
  }

  const coll = db.collection('frame_orders').where(where)
  const [listRes, countRes] = await Promise.all([
    coll.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get(),
    coll.count()
  ])

  const customerIds = [...new Set(listRes.data.map((o) => o.customerId).filter(Boolean))]
  let customerMap = {}
  if (customerIds.length) {
    const cRes = await db.collection('customers').where({ _id: _.in(customerIds) }).get()
    cRes.data.forEach((c) => { customerMap[c._id] = c })
  }

  const list = listRes.data.map((order) => ({
    ...order,
    customerName: customerMap[order.customerId]?.nickName || '-',
    createTimeText: order.createTime ? new Date(order.createTime).toLocaleString('zh-CN') : ''
  }))

  return { list, total: countRes.total, page, pageSize }
}

async function updateOrderStatus(payload) {
  const { orderId, status } = payload
  if (!orderId) throw new Error('缺少 orderId')
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`无效状态，可选：${ORDER_STATUSES.join('、')}`)
  }
  const extra = {}
  if (payload.shippingNo !== undefined) extra.shippingNo = payload.shippingNo
  await db.collection('frame_orders').doc(orderId).update({
    data: { status, ...extra, updateTime: db.serverDate() }
  })
  const res = await db.collection('frame_orders').doc(orderId).get()
  return res.data
}

async function getDashboard(payload) {
  const storeId = payload.storeId
  const startDate = payload.startDate || toDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const endDate = payload.endDate || toDateString(new Date())

  if (storeId) {
    return getStoreDashboard(storeId, startDate, endDate)
  }

  const storesRes = await db.collection('store_profile').limit(500).get()
  const stores = storesRes.data
  let totalAmount = 0
  let frameCount = 0
  let orderCount = 0
  let customerCount = 0
  let todayUnchecked = 0

  for (const store of stores) {
    const part = await getStoreDashboard(store._id, startDate, endDate)
    totalAmount += part.stats.totalAmount || 0
    frameCount += part.stats.frameCount || 0
    orderCount += part.stats.orderCount || 0
    customerCount += part.stats.customerCount || 0
    todayUnchecked += part.checkin.todayUnchecked || 0
  }

  return {
    scope: 'all',
    startDate,
    endDate,
    storeCount: stores.length,
    stats: { totalAmount, frameCount, orderCount, customerCount },
    checkin: { todayUnchecked },
    stores: stores.slice(0, 10).map((s) => ({
      _id: s._id,
      name: s.name,
      balance: s.balance,
      level: s.level
    }))
  }
}

async function getStoreDashboard(storeId, startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59`)

  const ordersRes = await db.collection('frame_orders')
    .where({
      storeId,
      createTime: _.gte(start).and(_.lte(end))
    })
    .limit(1000)
    .get()

  const orders = ordersRes.data
  const totalAmount = orders.reduce((sum, o) => sum + (Number(o.price) || 0), 0)
  const frameCount = orders.length

  const [customerCountRes, storeRes] = await Promise.all([
    db.collection('customers').where({ storeId }).count(),
    db.collection('store_profile').doc(storeId).get().catch(() => ({ data: null }))
  ])

  const today = toDateString(new Date())
  const checkin = await getCheckinSummary(storeId, today)

  return {
    scope: 'store',
    storeId,
    store: storeRes.data,
    startDate,
    endDate,
    stats: {
      totalAmount,
      frameCount,
      albumCount: 0,
      orderCount: frameCount,
      customerCount: customerCountRes.total
    },
    checkin
  }
}

async function getCheckinSummary(storeId, date) {
  const yesterday = new Date(date)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = toDateString(yesterday)

  const [allCustomersRes, todayCheckinsRes, yesterdayCheckinsRes] = await Promise.all([
    db.collection('customers').where({ storeId }).count(),
    db.collection('checkins').where({ storeId, checkinDate: date }).count(),
    db.collection('checkins').where({ storeId, checkinDate: yesterdayStr }).count()
  ])

  const totalCustomers = allCustomersRes.total
  const todayCount = todayCheckinsRes.total
  const yesterdayCount = yesterdayCheckinsRes.total

  return {
    date,
    yesterdayCount,
    todayCount,
    todayUnchecked: Math.max(0, totalCustomers - todayCount)
  }
}

async function listCheckins(query) {
  const storeId = query.storeId
  const date = query.date || toDateString(new Date())
  const type = query.type || 'unchecked'
  if (!storeId) throw new Error('请选择门店 storeId')

  const allCustomersRes = await db.collection('customers').where({ storeId }).get()
  const allCustomers = allCustomersRes.data

  const checkinsRes = await db.collection('checkins').where({ storeId, checkinDate: date }).get()
  const checkedIds = new Set(checkinsRes.data.map((c) => c.customerId))

  let list = []
  if (type === 'checked') {
    list = allCustomers.filter((c) => checkedIds.has(c._id))
  } else {
    list = allCustomers.filter((c) => !checkedIds.has(c._id))
  }

  return {
    date,
    type,
    total: list.length,
    list
  }
}

async function getOrderStatusCounts(query) {
  const storeId = query.storeId
  if (!storeId) throw new Error('请选择门店 storeId')
  const base = { storeId }
  const counts = {}
  await Promise.all(
    ORDER_STATUSES.map(async (status) => {
      const res = await db.collection('frame_orders').where({ ...base, status }).count()
      counts[status] = res.total
    })
  )
  const all = Object.values(counts).reduce((a, b) => a + b, 0)
  return { all, ...counts }
}

const PUBLIC_ACTIONS = new Set(['login', 'ping'])

async function dispatch(action, payload, query) {
  switch (action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() }
    case 'login':
      return login(payload.username, payload.password)
    case 'dashboard':
      return getDashboard({ ...query, ...payload })
    case 'stores.list':
      return listStores({ ...query, ...payload })
    case 'stores.get':
      return getStore(payload)
    case 'stores.update':
      return updateStore(payload)
    case 'customers.list':
      return listCustomers({ ...query, ...payload })
    case 'customers.get':
      return getCustomer(payload)
    case 'customers.update':
      return updateCustomer(payload)
    case 'orders.list':
      return listOrders({ ...query, ...payload })
    case 'orders.statusCounts':
      return getOrderStatusCounts({ ...query, ...payload })
    case 'orders.updateStatus':
      return updateOrderStatus(payload)
    case 'checkins.list':
      return listCheckins({ ...query, ...payload })
    case 'checkins.summary':
      return getCheckinSummary(payload.storeId, payload.date || toDateString(new Date()))
    default:
      throw new Error(`未知 action: ${action}`)
  }
}

module.exports = {
  PUBLIC_ACTIONS,
  dispatch,
  verifyToken
}
