const { login, verifyToken } = require('./auth')
const { db, _, ORDER_STATUSES, STYLE_TEMPLATES_COLLECTION, toDateString, parsePage } = require('./db')
const {
  uploadFrameCoverFromBase64,
  attachFrameCoverUrls,
  uploadStyleSampleFromBase64,
  attachStyleSampleUrls,
  attachCustomerAvatarUrls,
  uploadCustomerAvatarFromBase64
} = require('./cloudUpload')
const { formatCustomerForAdmin } = require('./customerFormat')
const { seedStyles: seedDefaultStyles } = require('./seedStyles')
const {
  sendStoreAssetAdjustCode,
  applyStoreAssetAdjustWithCode,
  listStoreAssetAdjustments
} = require('./storeAssetAdjust')

const STORE_DOC_ID_RE = /^store_/i

function resolveStoreDocId(payload) {
  const id = payload._id || payload.storeId || payload.id
  if (!id) throw new Error('缺少门店 _id')
  if (!STORE_DOC_ID_RE.test(id)) throw new Error('门店ID格式无效，仅支持 store_ 前缀')
  return id
}

async function listStores(query) {
  const { page, pageSize, skip } = parsePage(query)
  const keyword = (query.keyword || '').trim()
  const idFilter = { _id: db.RegExp({ regexp: '^store_', options: 'i' }) }
  let coll = db.collection('stores').where(
    keyword
      ? _.and([
          idFilter,
          _.or([
            { name: db.RegExp({ regexp: keyword, options: 'i' }) },
            { contactPhone: db.RegExp({ regexp: keyword, options: 'i' }) },
            { contactName: db.RegExp({ regexp: keyword, options: 'i' }) }
          ])
        ])
      : idFilter
  )
  const [listRes, countRes] = await Promise.all([
    coll.skip(skip).limit(pageSize).get(),
    coll.count()
  ])
  return {
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize
  }
}

async function getStore(payload) {
  const storeId = resolveStoreDocId(payload)
  const res = await db.collection('stores').doc(storeId).get()
  return res.data
}

async function updateStore(payload) {
  const storeId = resolveStoreDocId(payload)
  const assetKeys = ['balance', 'packageTotal', 'packageUsed']
  if (assetKeys.some((key) => payload[key] !== undefined)) {
    throw new Error('账户余额与套餐须通过「调整资产」并完成短信验证后生效')
  }
  const allowed = ['name', 'contactName', 'contactPhone', 'address', 'level', 'packageExpireDate', 'avatarUrl']
  const data = { updateTime: new Date() }
  allowed.forEach((key) => {
    if (payload[key] !== undefined) data[key] = payload[key]
  })
  if (Object.keys(data).length <= 1) throw new Error('没有可更新字段')
  await db.collection('stores').doc(storeId).update({ data })
  return getStore({ storeId })
}

async function listCustomers(query) {
  const { page, pageSize, skip } = parsePage(query)
  const storeId = query.storeId
  const keyword = (query.keyword || '').trim()
  if (!storeId) throw new Error('请选择门店 storeId')
  if (!/^store_/i.test(storeId)) throw new Error('门店ID格式无效，仅支持 store_ 前缀')

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
  const withAvatars = await attachCustomerAvatarUrls(listRes.data)
  return {
    list: withAvatars.map(formatCustomerForAdmin),
    total: countRes.total,
    page,
    pageSize
  }
}

function resolveCustomerDocId(payload) {
  const raw = payload.id || payload.customerId || payload._id
  const id = raw != null ? String(raw).trim() : ''
  if (!id) throw new Error('缺少客户 id')
  return id
}

async function getCustomer(payload) {
  const id = resolveCustomerDocId(payload)
  const res = await db.collection('customers').doc(id).get()
  if (!res.data) throw new Error('客户不存在')
  const [row] = await attachCustomerAvatarUrls([res.data])
  return formatCustomerForAdmin(row)
}

async function updateCustomer(payload) {
  const id = resolveCustomerDocId(payload)
  const allowed = ['nickName', 'phone', 'remark', 'equityAlbum', 'equityFrame', 'avatarUrl']
  const data = { updateTime: Date.now() }
  allowed.forEach((key) => {
    if (payload[key] !== undefined) {
      data[key] = key === 'avatarUrl' ? String(payload[key] || '').trim() : payload[key]
    }
  })
  if (Object.keys(data).length <= 1) throw new Error('没有可更新字段')
  await db.collection('customers').doc(id).update({ data })
  return getCustomer({ id })
}

async function uploadCustomerAvatar(payload) {
  const id = resolveCustomerDocId(payload)
  const res = await db.collection('customers').doc(id).get()
  if (!res.data) throw new Error('客户不存在')
  return uploadCustomerAvatarFromBase64(id, payload.base64, payload.mimeType || 'image/jpeg')
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

  const storesRes = await db.collection('stores').limit(500).get()
  const stores = storesRes.data
  let totalAmount = 0
  let frameCount = 0
  let orderCount = 0
  let customerCount = 0
  let todayUnchecked = 0

  for (const store of stores.filter((s) => STORE_DOC_ID_RE.test(s._id))) {
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
    db.collection('stores').doc(storeId).get().catch(() => ({ data: null }))
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
  const checkedIds = new Set(checkinsRes.data.map((c) => c.customerDocId).filter(Boolean))

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

const STYLE_MAX_ENABLED = 12
const STYLE_MAX_COUNT = 12

function formatStyleCode(num) {
  return `S${String(num).padStart(2, '0')}`
}

function parseStyleCode(id) {
  const m = String(id || '').match(/^S(\d{1,2})$/i)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= STYLE_MAX_COUNT ? n : null
}

function compareStyleId(a, b) {
  const na = parseStyleCode(a.id)
  const nb = parseStyleCode(b.id)
  if (na != null && nb != null && na !== nb) return na - nb
  if (na != null && nb == null) return -1
  if (na == null && nb != null) return 1
  return String(a.id || '').localeCompare(String(b.id || ''))
}

async function collectUsedStyleCodes() {
  const res = await db.collection(STYLE_TEMPLATES_COLLECTION).limit(100).get()
  const used = new Set()
  res.data.forEach((row) => {
    const n = parseStyleCode(row.id)
    if (n) used.add(n)
  })
  return { total: res.data.length, used }
}

async function allocateStyleId() {
  const { total, used } = await collectUsedStyleCodes()
  if (total >= STYLE_MAX_COUNT) {
    throw new Error(`风格最多 ${STYLE_MAX_COUNT} 个（S01–S12）`)
  }
  for (let i = 1; i <= STYLE_MAX_COUNT; i++) {
    if (!used.has(i)) return formatStyleCode(i)
  }
  throw new Error('风格编号 S01–S12 已满')
}

async function countEnabledStyles() {
  const res = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ enabled: true }).count()
  return res.total
}

async function findStyleByName(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  const res = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ name: trimmed }).limit(1).get()
  return res.data[0] || null
}

async function assertStyleNameUnique(name, excludeDocId) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('请填写风格名称')
  const existing = await findStyleByName(trimmed)
  if (existing && existing._id !== excludeDocId) {
    const code = existing.id ? `编号 ${existing.id}` : '已有记录'
    throw new Error(`风格名称「${trimmed}」已存在（${code}）`)
  }
}

async function listStyles(query) {
  const { page, pageSize, skip } = parsePage(query)
  const keyword = (query.keyword || '').trim()
  let coll = db.collection(STYLE_TEMPLATES_COLLECTION)
  if (keyword) {
    coll = coll.where(_.or([
      { name: db.RegExp({ regexp: keyword, options: 'i' }) },
      { id: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
  }
  const [countRes, listRes] = await Promise.all([
    coll.count(),
    coll.limit(100).get()
  ])
  const sorted = listRes.data.slice().sort((a, b) => {
    const byId = compareStyleId(a, b)
    if (byId !== 0) return byId
    const sa = Number(a.sort) || 0
    const sb = Number(b.sort) || 0
    return sa - sb
  })
  const list = await attachStyleSampleUrls(sorted.slice(skip, skip + pageSize))
  return {
    list,
    total: countRes.total,
    enabledCount: sorted.filter((row) => row.enabled !== false).length,
    page,
    pageSize
  }
}

async function getStyle(payload) {
  let row
  if (payload._id) {
    const res = await db.collection(STYLE_TEMPLATES_COLLECTION).doc(payload._id).get()
    row = res.data
  } else {
    const id = (payload.id || '').trim()
    if (!id) throw new Error('缺少风格 id')
    const res = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id }).limit(1).get()
    if (!res.data.length) throw new Error('风格不存在')
    row = res.data[0]
  }
  const [withUrl] = await attachStyleSampleUrls([row])
  return withUrl
}

async function createStyle(payload) {
  const name = (payload.name || '').trim()
  const prompt = (payload.prompt || '').trim()
  const sampleFileId = (payload.sampleFileId || '').trim()
  if (!name) throw new Error('请填写风格名称')
  if (!sampleFileId) throw new Error('请上传风格样图')
  await assertStyleNameUnique(name)

  const id = await allocateStyleId()
  const enabled = payload.enabled !== false
  if (enabled) {
    const enabledCount = await countEnabledStyles()
    if (enabledCount >= STYLE_MAX_ENABLED) {
      throw new Error(`启用中的风格最多 ${STYLE_MAX_ENABLED} 个`)
    }
  }

  const now = new Date()
  const data = {
    id,
    name,
    prompt,
    sampleFileId,
    sort: Number(payload.sort) || 0,
    enabled,
    createTime: now,
    updateTime: now
  }
  const addRes = await db.collection(STYLE_TEMPLATES_COLLECTION).add({ data })
  const [row] = await attachStyleSampleUrls([{ _id: addRes._id, ...data }])
  return row
}

async function updateStyle(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')

  const currentRes = await db.collection(STYLE_TEMPLATES_COLLECTION).doc(docId).get()
  const current = currentRes.data
  if (!current) throw new Error('风格不存在')

  const nextEnabled = payload.enabled !== undefined ? payload.enabled !== false : current.enabled !== false
  if (nextEnabled && current.enabled === false) {
    const enabledCount = await countEnabledStyles()
    if (enabledCount >= STYLE_MAX_ENABLED) {
      throw new Error(`启用中的风格最多 ${STYLE_MAX_ENABLED} 个`)
    }
  }

  const allowed = ['name', 'prompt', 'sampleFileId', 'sort', 'enabled']
  const data = { updateTime: new Date() }
  if (payload.name !== undefined) {
    const name = (payload.name || '').trim()
    if (!name) throw new Error('风格名称不能为空')
    if (name !== String(current.name || '').trim()) {
      await assertStyleNameUnique(name, docId)
    }
    data.name = name
  }
  allowed.forEach((key) => {
    if (payload[key] === undefined || key === 'name') return
    if (key === 'enabled') {
      data.enabled = payload.enabled !== false
      return
    }
    if (key === 'sort') {
      data.sort = Number(payload.sort) || 0
      return
    }
    if (key === 'prompt') {
      data.prompt = (payload.prompt || '').trim()
      return
    }
    if (key === 'sampleFileId') {
      const sampleFileId = (payload.sampleFileId || '').trim()
      if (!sampleFileId) throw new Error('请上传风格样图')
      data.sampleFileId = sampleFileId
    }
  })

  if (Object.keys(data).length <= 1) throw new Error('没有可更新字段')
  await db.collection(STYLE_TEMPLATES_COLLECTION).doc(docId).update({ data })
  return getStyle({ _id: docId })
}

async function deleteStyle(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')
  await db.collection(STYLE_TEMPLATES_COLLECTION).doc(docId).remove()
  return { deleted: true }
}

const {
  isSizeEmpty: isFrameSizeEmpty,
  validateFrameSizeSides
} = require('./frameSizeValidate')

function buildFrameSizeFromPayload(payload) {
  const sizeAxis = 'lw'
  const rawFirst = payload.sizeFirst
  const rawSecond = payload.sizeSecond
  const hasFirst = !isFrameSizeEmpty(rawFirst)
  const hasSecond = !isFrameSizeEmpty(rawSecond)

  if (!hasFirst && !hasSecond) {
    return { sizeAxis, sizeUnit: 'cm', sizeFirst: null, sizeSecond: null, size: '' }
  }
  if (!hasFirst || !hasSecond) {
    throw new Error('请同时填写长、宽两个尺寸，或全部留空')
  }

  const { sizeFirst, sizeSecond, sizeUnit } = validateFrameSizeSides(
    rawFirst,
    rawSecond,
    payload.sizeUnit
  )
  return {
    sizeAxis,
    sizeUnit,
    sizeFirst,
    sizeSecond,
    size: `${sizeFirst}${sizeUnit} × ${sizeSecond}${sizeUnit}`
  }
}

const FRAME_MAX_COUNT = 99

function formatFrameCode(num) {
  return `F${String(num).padStart(2, '0')}`
}

function parseFrameCode(id) {
  const m = String(id || '').match(/^F(\d{1,2})$/i)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= FRAME_MAX_COUNT ? n : null
}

function compareFrameId(a, b) {
  const na = parseFrameCode(a.id)
  const nb = parseFrameCode(b.id)
  if (na != null && nb != null && na !== nb) return na - nb
  if (na != null && nb == null) return -1
  if (na == null && nb != null) return 1
  return String(a.id || '').localeCompare(String(b.id || ''))
}

async function collectUsedFrameCodes() {
  const res = await db.collection('frame_templates').limit(100).get()
  const used = new Set()
  res.data.forEach((row) => {
    const n = parseFrameCode(row.id)
    if (n) used.add(n)
  })
  return { total: res.data.length, used }
}

async function allocateFrameId() {
  const { total, used } = await collectUsedFrameCodes()
  if (total >= FRAME_MAX_COUNT) {
    throw new Error(`相框最多 ${FRAME_MAX_COUNT} 个（F01 起）`)
  }
  for (let i = 1; i <= FRAME_MAX_COUNT; i++) {
    if (!used.has(i)) return formatFrameCode(i)
  }
  throw new Error('相框编号已满')
}

async function findFrameByName(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  const res = await db.collection('frame_templates').where({ name: trimmed }).limit(1).get()
  return res.data[0] || null
}

async function assertFrameNameUnique(name, excludeDocId) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('请填写相框名称')
  const existing = await findFrameByName(trimmed)
  if (existing && existing._id !== excludeDocId) {
    const code = existing.id ? `编号 ${existing.id}` : '已有记录'
    throw new Error(`相框名称「${trimmed}」已存在（${code}）`)
  }
}

async function listFrames(query) {
  const { page, pageSize, skip } = parsePage(query)
  const keyword = (query.keyword || '').trim()
  let coll = db.collection('frame_templates')
  if (keyword) {
    coll = coll.where(_.or([
      { name: db.RegExp({ regexp: keyword, options: 'i' }) },
      { id: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
  }
  const [countRes, listRes] = await Promise.all([
    coll.count(),
    coll.limit(100).get()
  ])
  const sorted = listRes.data.slice().sort((a, b) => {
    const byId = compareFrameId(a, b)
    if (byId !== 0) return byId
    const sa = Number(a.sort) || 0
    const sb = Number(b.sort) || 0
    return sa - sb
  })
  const list = await attachFrameCoverUrls(sorted.slice(skip, skip + pageSize))
  return {
    list,
    total: countRes.total,
    enabledCount: sorted.filter((row) => row.enabled !== false).length,
    page,
    pageSize
  }
}

async function uploadFrameCover(payload) {
  return uploadFrameCoverFromBase64(payload.base64, payload.mimeType || 'image/jpeg')
}

async function uploadStyleSample(payload) {
  return uploadStyleSampleFromBase64(payload.base64, payload.mimeType || 'image/jpeg')
}

async function getFrame(payload) {
  if (payload._id) {
    const res = await db.collection('frame_templates').doc(payload._id).get()
    const [row] = await attachFrameCoverUrls([res.data])
    return row
  }
  const id = (payload.id || '').trim()
  if (!id) throw new Error('缺少相框 id')
  const res = await db.collection('frame_templates').where({ id }).limit(1).get()
  if (!res.data.length) throw new Error('相框不存在')
  const [row] = await attachFrameCoverUrls([res.data[0]])
  return row
}

async function createFrame(payload) {
  const name = (payload.name || '').trim()
  if (!name) throw new Error('请填写相框名称')
  await assertFrameNameUnique(name)

  const id = await allocateFrameId()
  const now = new Date()
  const sizeFields = buildFrameSizeFromPayload(payload)
  const data = {
    id,
    name,
    coverFileId: (payload.coverFileId || '').trim(),
    material: (payload.material || '').trim(),
    sort: Number(payload.sort) || 0,
    enabled: payload.enabled !== false,
    ...sizeFields,
    createTime: now,
    updateTime: now
  }
  const addRes = await db.collection('frame_templates').add({ data })
  return { _id: addRes._id, ...data }
}

async function updateFrame(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')

  const currentRes = await db.collection('frame_templates').doc(docId).get()
  if (!currentRes.data) throw new Error('相框不存在')

  const current = currentRes.data
  const data = { updateTime: new Date() }
  if (payload.name !== undefined) {
    const name = (payload.name || '').trim()
    if (!name) throw new Error('相框名称不能为空')
    if (name !== String(current.name || '').trim()) {
      await assertFrameNameUnique(name, docId)
    }
    data.name = name
  }
  if (payload.coverFileId !== undefined) {
    data.coverFileId = (payload.coverFileId || '').trim()
  }
  if (payload.material !== undefined) data.material = (payload.material || '').trim()
  if (payload.sort !== undefined) data.sort = Number(payload.sort) || 0
  if (payload.enabled !== undefined) data.enabled = payload.enabled !== false
  if (
    payload.sizeFirst !== undefined
    || payload.sizeSecond !== undefined
    || payload.sizeUnit !== undefined
  ) {
    Object.assign(data, buildFrameSizeFromPayload({
      sizeFirst: payload.sizeFirst !== undefined ? payload.sizeFirst : currentRes.data.sizeFirst,
      sizeSecond: payload.sizeSecond !== undefined ? payload.sizeSecond : currentRes.data.sizeSecond,
      sizeUnit: payload.sizeUnit !== undefined ? payload.sizeUnit : currentRes.data.sizeUnit
    }))
  }

  if (Object.keys(data).length <= 1) throw new Error('没有可更新字段')
  await db.collection('frame_templates').doc(docId).update({ data })
  return getFrame({ _id: docId })
}

async function deleteFrame(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')
  await db.collection('frame_templates').doc(docId).remove()
  return { deleted: true }
}

const PLATFORM_SETTINGS_COL = 'platform_settings'
const PLATFORM_SETTINGS_ID = 'default'

async function getPlatformSettings() {
  try {
    const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get()
    return {
      _id: PLATFORM_SETTINGS_ID,
      supportPhone: (res.data && res.data.supportPhone) || '',
      updateTime: res.data?.updateTime || null
    }
  } catch (e) {
    return { _id: PLATFORM_SETTINGS_ID, supportPhone: '', updateTime: null }
  }
}

async function updatePlatformSettings(payload) {
  const supportPhone = (payload.supportPhone || '').trim()
  if (supportPhone && !/^[\d\s\-+()]{6,24}$/.test(supportPhone)) {
    throw new Error('平台电话格式不正确')
  }
  await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).set({
    data: {
      supportPhone,
      updateTime: new Date()
    }
  })
  return getPlatformSettings()
}

const FEEDBACK_COL = 'user_feedback'

function formatDateTime(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}`
}

function formatFeedbackRow(row) {
  return {
    ...row,
    createTimeText: formatDateTime(row.createTime),
    sourceRoleLabel: row.sourceRole === 'store' ? '门店' : '顾客'
  }
}

async function listFeedbacks(query) {
  const { page, pageSize, skip } = parsePage(query)
  const sourceRole = (query.sourceRole || '').trim()
  const status = (query.status || '').trim()
  const keyword = (query.keyword || '').trim()
  const storeId = (query.storeId || '').trim()

  const filters = []
  if (sourceRole === 'customer' || sourceRole === 'store') {
    filters.push({ sourceRole })
  }
  if (status === 'pending' || status === 'read') {
    filters.push({ status })
  }
  if (storeId && /^store_/i.test(storeId)) {
    filters.push({ storeId })
  }
  if (keyword) {
    filters.push(_.or([
      { content: db.RegExp({ regexp: keyword, options: 'i' }) },
      { submitterName: db.RegExp({ regexp: keyword, options: 'i' }) },
      { submitterPhone: db.RegExp({ regexp: keyword, options: 'i' }) },
      { contact: db.RegExp({ regexp: keyword, options: 'i' }) },
      { storeName: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]))
  }

  let coll = db.collection(FEEDBACK_COL)
  if (filters.length) {
    const where = filters.length === 1 ? filters[0] : _.and(filters)
    coll = coll.where(where)
  }

  let list = []
  let total = 0
  try {
    const [listRes, countRes] = await Promise.all([
      coll.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get(),
      coll.count()
    ])
    list = listRes.data || []
    total = countRes.total
  } catch (err) {
    console.warn('[feedbacks.list] orderBy failed, fallback to memory sort', err.message)
    const allRes = await coll.limit(100).get()
    const sorted = (allRes.data || []).sort((a, b) => {
      const ta = a.createTime ? new Date(a.createTime).getTime() : 0
      const tb = b.createTime ? new Date(b.createTime).getTime() : 0
      return tb - ta
    })
    total = sorted.length
    list = sorted.slice(skip, skip + pageSize)
  }

  return {
    list: list.map(formatFeedbackRow),
    total,
    page,
    pageSize
  }
}

async function updateFeedbackStatus(payload) {
  const id = payload._id || payload.id
  if (!id) throw new Error('缺少反馈 id')
  const status = payload.status
  if (status !== 'pending' && status !== 'read') {
    throw new Error('状态无效')
  }
  await db.collection(FEEDBACK_COL).doc(id).update({
    data: {
      status,
      updateTime: new Date()
    }
  })
  const res = await db.collection(FEEDBACK_COL).doc(id).get()
  return formatFeedbackRow(res.data)
}

async function deleteFeedback(payload) {
  const id = payload._id || payload.id
  if (!id) throw new Error('缺少反馈 id')
  try {
    await db.collection(FEEDBACK_COL).doc(id).remove()
  } catch (e) {
    throw new Error('反馈不存在或已删除')
  }
  return { _id: id }
}

const PUBLIC_ACTIONS = new Set(['login', 'ping'])

function adminUsername(payload) {
  return (payload && payload._adminUser) || 'admin'
}

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
    case 'stores.assetAdjust.sendCode':
      return sendStoreAssetAdjustCode(resolveStoreDocId(payload))
    case 'stores.assetAdjust.apply':
      return applyStoreAssetAdjustWithCode(
        resolveStoreDocId(payload),
        payload,
        payload.smsCode,
        adminUsername(payload)
      )
    case 'stores.assetAdjust.list':
      return listStoreAssetAdjustments({ ...query, ...payload })
    case 'customers.list':
      return listCustomers({ ...query, ...payload })
    case 'customers.get':
      return getCustomer(payload)
    case 'customers.update':
      return updateCustomer(payload)
    case 'customers.uploadAvatar':
      return uploadCustomerAvatar(payload)
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
    case 'styles.list':
      return listStyles({ ...query, ...payload })
    case 'styles.get':
      return getStyle(payload)
    case 'styles.create':
      return createStyle(payload)
    case 'styles.update':
      return updateStyle(payload)
    case 'styles.delete':
      return deleteStyle(payload)
    case 'styles.uploadSample':
      return uploadStyleSample(payload)
    case 'styles.seedDefaults':
      return seedDefaultStyles(db)
    case 'frames.list':
      return listFrames({ ...query, ...payload })
    case 'frames.get':
      return getFrame(payload)
    case 'frames.create':
      return createFrame(payload)
    case 'frames.update':
      return updateFrame(payload)
    case 'frames.delete':
      return deleteFrame(payload)
    case 'frames.uploadCover':
      return uploadFrameCover(payload)
    case 'platformSettings.get':
      return getPlatformSettings()
    case 'platformSettings.update':
      return updatePlatformSettings(payload)
    case 'feedbacks.list':
      return listFeedbacks({ ...query, ...payload })
    case 'feedbacks.updateStatus':
      return updateFeedbackStatus(payload)
    case 'feedbacks.delete':
      return deleteFeedback(payload)
    default:
      throw new Error(`未知 action: ${action}`)
  }
}

module.exports = {
  PUBLIC_ACTIONS,
  dispatch,
  verifyToken
}
