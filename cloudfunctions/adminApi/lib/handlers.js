const { login, verifyToken } = require('./auth')
const { db, _, ORDER_STATUSES, STYLE_TEMPLATES_COLLECTION, toDateString, parsePage } = require('./db')
const {
  uploadFrameCoverFromBase64,
  attachFrameCoverUrls,
  uploadStyleSampleFromBase64,
  uploadStyleHdSampleFromBase64,
  uploadStyleHdBuffer,
  prepareStyleSampleDirectUpload,
  assertValidStyleSampleFileId,
  downloadCloudFileAsBase64,
  getDisplayUrl,
  attachStyleSampleUrls,
  attachCustomerAvatarUrls,
  uploadCustomerAvatarFromBase64
} = require('./cloudUpload')
const { formatCustomerForAdmin } = require('./customerFormat')
const { seedStyles: seedDefaultStyles } = require('./seedStyles')
const { normalizeStyleGender, formatStyleGenderRow } = require('./styleGender')
const {
  STYLE_MAX_COUNT,
  STYLE_MAX_ENABLED,
  compareStyleId,
  allocateStyleIdFromRows,
  normalizeStyleBusinessId,
  styleIdFullRangeLabel
} = require('./styleId')
const { normalizeStyleResolution } = require('./styleResolution')
const {
  sendStoreAssetAdjustCode,
  applyStoreAssetAdjustWithCode,
  listStoreAssetAdjustments
} = require('./storeAssetAdjust')
const { deleteCloudFileSafe, deleteReplacedCloudFile, deleteCloudFilesSafe } = require('./cloudFile')
const {
  listGalleryBatches,
  getGalleryBatch,
  deleteGalleryBatch,
  batchDeleteGalleryBatches
} = require('./gallery')
const {
  listRechargePackages,
  getRechargePackage,
  createRechargePackage,
  updateRechargePackage,
  deleteRechargePackage,
  seedDefaultPackages
} = require('./rechargePackages')
const { deleteOrder, batchDeleteOrders, updateOrderShipping, resolveOrderCollection } = require('./orders')
const { listMergedOrders, getMergedOrderStatusCounts } = require('./orderList')
const { prepareOrderExport, fetchOrderExportImage } = require('./orderExport')

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
  return listMergedOrders(query)
}

async function updateOrderStatus(payload) {
  const { orderId, status } = payload
  if (!orderId) throw new Error('缺少 orderId')
  if (!ORDER_STATUSES.includes(status)) {
    throw new Error(`无效状态，可选：${ORDER_STATUSES.join('、')}`)
  }

  const orderType = payload.orderType === 'album' ? 'album' : 'frame'
  const collection = resolveOrderCollection(orderType)
  const cur = await db.collection(collection).doc(orderId).get()
  const order = cur.data
  if (!order) throw new Error('订单不存在')

  const extra = { updateTime: db.serverDate() }
  if (payload.shippingNo !== undefined) extra.shippingNo = payload.shippingNo
  if (payload.shippingCom !== undefined) extra.shippingCom = payload.shippingCom
  if (payload.shippingCompanyName !== undefined) extra.shippingCompanyName = payload.shippingCompanyName
  if (status === '已发货' && !order.shippedAt) extra.shippedAt = db.serverDate()
  if (status === '已完成' && !order.completedAt) extra.completedAt = db.serverDate()
  const shippingChanged =
    (payload.shippingNo !== undefined &&
      String(payload.shippingNo || '').trim() !== String(order.shippingNo || '').trim()) ||
    (payload.shippingCom !== undefined &&
      String(payload.shippingCom || '').trim() !== String(order.shippingCom || '').trim())
  if (shippingChanged) {
    extra.logisticsCache = _.remove()
  }
  await db.collection(collection).doc(orderId).update({
    data: { status, ...extra }
  })
  const res = await db.collection(collection).doc(orderId).get()
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
  return getMergedOrderStatusCounts(query)
}

async function collectAllStyleRows() {
  const res = await db.collection(STYLE_TEMPLATES_COLLECTION).limit(100).get()
  return res.data || []
}

async function findStyleByBusinessId(id) {
  const trimmed = String(id || '').trim().toUpperCase()
  if (!trimmed) return null
  const res = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ id: trimmed }).limit(1).get()
  return res.data[0] || null
}

async function allocateStyleId(gender) {
  const rows = await collectAllStyleRows()
  return allocateStyleIdFromRows(rows, gender)
}

async function countEnabledStyles() {
  const res = await db.collection(STYLE_TEMPLATES_COLLECTION).where({ enabled: true }).count()
  return res.total
}

async function findStyleByNameAndGender(name, gender) {
  const trimmed = (name || '').trim()
  if (!trimmed) return null
  const g = normalizeStyleGender(gender)
  const res = await db
    .collection(STYLE_TEMPLATES_COLLECTION)
    .where({ name: trimmed, gender: g })
    .limit(1)
    .get()
  return res.data[0] || null
}

/** 同性别内名称不可重复；男女可同名（如 F01/M01 均为「经典肖像」） */
async function assertStyleNameUnique(name, gender, excludeDocId) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('请填写风格名称')
  const g = normalizeStyleGender(gender)
  const existing = await findStyleByNameAndGender(trimmed, g)
  if (existing && existing._id !== excludeDocId) {
    const code = existing.id ? `编号 ${existing.id}` : '已有记录'
    throw new Error(`该性别下风格名称「${trimmed}」已存在（${code}）`)
  }
}

function buildStyleListWhere(keyword, gender) {
  const parts = []
  const kw = (keyword || '').trim()
  if (kw) {
    parts.push(_.or([
      { name: db.RegExp({ regexp: kw, options: 'i' }) },
      { id: db.RegExp({ regexp: kw, options: 'i' }) }
    ]))
  }
  const genderRaw = String(gender || '').trim()
  if (genderRaw === '女' || genderRaw === 'female') {
    parts.push(
      _.or([
        { id: db.RegExp({ regexp: '^F\\d{2}$', options: 'i' }) },
        _.and([
          { id: db.RegExp({ regexp: '^S\\d', options: 'i' }) },
          { gender: '女' }
        ])
      ])
    )
  } else if (genderRaw === '男' || genderRaw === 'male') {
    parts.push(
      _.or([
        { id: db.RegExp({ regexp: '^M\\d{2}$', options: 'i' }) },
        _.and([
          { id: db.RegExp({ regexp: '^S\\d', options: 'i' }) },
          _.or([{ gender: '男' }, { gender: _.exists(false) }, { gender: '' }])
        ])
      ])
    )
  }
  if (!parts.length) return null
  if (parts.length === 1) return parts[0]
  return _.and(parts)
}

async function listStyles(query) {
  const { page, pageSize, skip } = parsePage(query)
  const keyword = (query.keyword || '').trim()
  let coll = db.collection(STYLE_TEMPLATES_COLLECTION)
  const where = buildStyleListWhere(keyword, query.gender)
  if (where) {
    coll = coll.where(where)
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
  const list = (await attachStyleSampleUrls(sorted.slice(skip, skip + pageSize))).map(formatStyleGenderRow)
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
  return formatStyleGenderRow(withUrl)
}

async function createStyle(payload) {
  const name = (payload.name || '').trim()
  const prompt = (payload.prompt || '').trim()
  const sampleFileId = (payload.sampleFileId || '').trim()
  const sampleHdFileId = (payload.sampleHdFileId || '').trim()
  if (!name) throw new Error('请填写风格名称')
  if (!sampleFileId) throw new Error('请上传风格样图')
  const gender = normalizeStyleGender(payload.gender)
  await assertStyleNameUnique(name, gender)

  let id
  if (payload.id != null && String(payload.id).trim()) {
    id = normalizeStyleBusinessId(payload.id, gender)
    const existing = await findStyleByBusinessId(id)
    if (existing) throw new Error(`风格编号 ${id} 已存在`)
  } else {
    id = await allocateStyleId(gender)
  }

  const enabled = payload.enabled !== false
  if (enabled) {
    const enabledCount = await countEnabledStyles()
    if (enabledCount >= STYLE_MAX_ENABLED) {
      throw new Error(`启用中的风格最多 ${STYLE_MAX_ENABLED} 个`)
    }
  }

  const now = new Date()
  const resolution = normalizeStyleResolution(payload.resolution)
  const data = {
    id,
    name,
    prompt,
    sampleFileId,
    sampleHdFileId,
    resolution,
    gender,
    sort: Number(payload.sort) || 0,
    enabled,
    createTime: now,
    updateTime: now
  }
  const addRes = await db.collection(STYLE_TEMPLATES_COLLECTION).add({ data })
  const [row] = await attachStyleSampleUrls([{ _id: addRes._id, ...data }])
  return formatStyleGenderRow(row)
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

  const allowed = ['name', 'prompt', 'sampleFileId', 'sampleHdFileId', 'resolution', 'gender', 'sort', 'enabled']
  const data = { updateTime: new Date() }
  if (payload.name !== undefined) {
    const name = (payload.name || '').trim()
    if (!name) throw new Error('风格名称不能为空')
    if (name !== String(current.name || '').trim()) {
      const genderForName =
        payload.gender !== undefined
          ? normalizeStyleGender(payload.gender)
          : normalizeStyleGender(current.gender)
      await assertStyleNameUnique(name, genderForName, docId)
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
      return
    }
    if (key === 'sampleHdFileId') {
      data.sampleHdFileId = (payload.sampleHdFileId || '').trim()
      return
    }
    if (key === 'resolution') {
      data.resolution = normalizeStyleResolution(payload.resolution)
      return
    }
    if (key === 'gender') {
      data.gender = normalizeStyleGender(payload.gender)
    }
  })

  if (Object.keys(data).length <= 1) throw new Error('没有可更新字段')

  const prevSampleFileId = current.sampleFileId
  const prevSampleHdFileId = current.sampleHdFileId

  await db.collection(STYLE_TEMPLATES_COLLECTION).doc(docId).update({ data })

  if (data.sampleFileId !== undefined) {
    await deleteReplacedCloudFile(prevSampleFileId, data.sampleFileId)
  }
  if (data.sampleHdFileId !== undefined) {
    await deleteReplacedCloudFile(prevSampleHdFileId, data.sampleHdFileId)
  }
  return getStyle({ _id: docId })
}

async function deleteStyle(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')
  const currentRes = await db.collection(STYLE_TEMPLATES_COLLECTION).doc(docId).get()
  const sampleFileId = currentRes.data && currentRes.data.sampleFileId
  const sampleHdFileId = currentRes.data && currentRes.data.sampleHdFileId
  await db.collection(STYLE_TEMPLATES_COLLECTION).doc(docId).remove()
  if (sampleFileId) await deleteCloudFileSafe(sampleFileId)
  if (sampleHdFileId) await deleteCloudFileSafe(sampleHdFileId)
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
  const mimeType = payload.mimeType || 'image/jpeg'
  const hasThumbB64 = !!(payload.base64 && String(payload.base64).trim())
  const hasHdB64 = !!(payload.hdBase64 && String(payload.hdBase64).trim())
  const hasThumbId = !!(payload.sampleFileId && String(payload.sampleFileId).trim())
  const hasHdId = !!(payload.sampleHdFileId && String(payload.sampleHdFileId).trim())
  if (!hasThumbB64 && !hasHdB64 && !hasThumbId && !hasHdId) {
    throw new Error('缺少图片数据')
  }

  let sampleFileId = ''
  let sampleUrl = ''
  if (hasThumbB64) {
    const sampleRes = await uploadStyleSampleFromBase64(payload.base64, mimeType)
    sampleFileId = sampleRes.sampleFileId
    sampleUrl = sampleRes.sampleUrl
  } else if (hasThumbId) {
    sampleFileId = assertValidStyleSampleFileId(payload.sampleFileId, 'thumb')
    sampleUrl = await getDisplayUrl(sampleFileId)
  }

  let sampleHdFileId = ''
  let sampleHdUrl = ''
  if (hasHdB64) {
    const hdRes = await uploadStyleHdSampleFromBase64(payload.hdBase64, mimeType)
    sampleHdFileId = hdRes.sampleHdFileId
    sampleHdUrl = hdRes.sampleHdUrl
  } else if (hasHdId) {
    sampleHdFileId = assertValidStyleSampleFileId(payload.sampleHdFileId, 'hd')
    sampleHdUrl = await getDisplayUrl(sampleHdFileId)
  }

  return { sampleFileId, sampleUrl, sampleHdFileId, sampleHdUrl }
}

async function prepareStyleSampleUpload(payload) {
  const kind = String(payload.kind || 'thumb').trim().toLowerCase()
  if (kind !== 'thumb' && kind !== 'hd') throw new Error('kind 须为 thumb 或 hd')
  return prepareStyleSampleDirectUpload({
    kind,
    mimeType: payload.mimeType || 'image/jpeg'
  })
}

async function fetchStyleSampleImage(payload) {
  const fileId = (
    payload.fileId ||
    payload.sampleHdFileId ||
    payload.sampleFileId ||
    ''
  ).trim()
  if (!fileId) throw new Error('缺少样图 fileId')
  return downloadCloudFileAsBase64(fileId)
}

const { generateSeedreamStyleSample } = require('./arkSeedreamSample')

async function generateStyleSample(payload) {
  const prompt = String(payload.prompt || '').trim()
  if (!prompt) throw new Error('请先填写提示词')

  const settings = await readPlatformSettingsDoc()
  const modelId = normalizeSeedreamModelId(settings.seedreamModelId)
  const sizeTier = normalizeSeedreamSizeTier(
    settings.seedreamSizeTier || DEFAULT_SEEDREAM_SIZE_TIER
  )
  const orientation = normalizeSeedreamOrientation(
    settings.seedreamOrientation || DEFAULT_SEEDREAM_ORIENTATION
  )
  const size = resolveSeedreamOutputSize(sizeTier, orientation)

  const { buffer, reportedSize, promptPreview } = await generateSeedreamStyleSample(prompt, {
    modelId,
    size: size || undefined
  })

  const { sampleHdFileId, sampleHdUrl } = await uploadStyleHdBuffer(buffer, 'image/jpeg')

  return {
    sampleHdFileId,
    sampleHdUrl,
    byteSize: buffer.length,
    reportedSize,
    promptPreview
  }
}

async function discardStyleSamples(payload) {
  const fileIds = [
    ...new Set(
      (Array.isArray(payload.fileIds) ? payload.fileIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => id.startsWith('cloud://'))
    )
  ]
  if (!fileIds.length) return { deleted: 0, requested: 0 }
  const { deleted, skipped } = await deleteCloudFilesSafe(fileIds)
  return { deleted, skipped, requested: fileIds.length }
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

  if (data.coverFileId !== undefined) {
    await deleteReplacedCloudFile(current.coverFileId, data.coverFileId)
  }
  if (Object.keys(data).length <= 1) throw new Error('没有可更新字段')
  await db.collection('frame_templates').doc(docId).update({ data })
  return getFrame({ _id: docId })
}

async function deleteFrame(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')
  const currentRes = await db.collection('frame_templates').doc(docId).get()
  const coverFileId = currentRes.data && currentRes.data.coverFileId
  await db.collection('frame_templates').doc(docId).remove()
  if (coverFileId) await deleteCloudFileSafe(coverFileId)
  return { deleted: true }
}

const {
  normalizeAlbumPlatformConfig,
  validateAlbumPlatformConfigPayload
} = require('./albumPlatformConfig')
const {
  PORTRAIT_ENGINE_OPTIONS,
  PORTRAIT_ENGINE_SEEDREAM,
  normalizePortraitEngine,
  getPortraitEngineLabel,
  normalizeSeedreamModelId
} = require('./portraitEngineConfig')
const {
  DEFAULT_SEEDREAM_SIZE_TIER,
  DEFAULT_SEEDREAM_ORIENTATION,
  normalizeSeedreamSizeTier,
  normalizeSeedreamOrientation,
  describeSeedreamOutputSize,
  resolveSeedreamOutputSize
} = require('./seedreamOutputSize')

const PLATFORM_SETTINGS_COL = 'platform_settings'
const PLATFORM_SETTINGS_ID = 'default'

function maskAccessKey(key) {
  const k = String(key || '').trim()
  if (!k) return ''
  if (k.length <= 8) return '****'
  return `${k.slice(0, 4)}****${k.slice(-4)}`
}

function clampJimengMaxConcurrency(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(10, Math.max(1, Math.floor(n)))
}

function clampSeedreamMaxConcurrency(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 10
  return Math.min(50, Math.max(1, Math.floor(n)))
}

function readEnvJimengMaxConcurrency() {
  const raw = process.env.JIMENG_MAX_CONCURRENCY
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  return clampJimengMaxConcurrency(raw)
}

function readEnvSeedreamMaxConcurrency() {
  const raw = process.env.SEEDREAM_MAX_CONCURRENCY
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  return clampSeedreamMaxConcurrency(raw)
}

async function readPlatformSettingsDoc() {
  try {
    const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get()
    return res.data || {}
  } catch (e) {
    return {}
  }
}

async function getPlatformSettings() {
  const raw = await readPlatformSettingsDoc()
  const savedJimeng = clampJimengMaxConcurrency(raw.jimengMaxConcurrency ?? 1)
  const savedSeedream = clampSeedreamMaxConcurrency(raw.seedreamMaxConcurrency ?? 10)
  const envJimeng = readEnvJimengMaxConcurrency()
  const envSeedream = readEnvSeedreamMaxConcurrency()
  const album = normalizeAlbumPlatformConfig(raw)
  const portraitEngine = normalizePortraitEngine(raw.portraitEngine)
  return {
    _id: PLATFORM_SETTINGS_ID,
    supportPhone: raw.supportPhone || '',
    volcAccessKeyMasked: maskAccessKey(raw.volcAccessKey),
    volcSecretKeyConfigured: !!String(raw.volcSecretKey || '').trim(),
    volcKeysUpdateTime: raw.volcKeysUpdateTime || null,
    portraitEngine,
    portraitEngineLabel: getPortraitEngineLabel(portraitEngine),
    portraitEngineOptions: PORTRAIT_ENGINE_OPTIONS,
    arkApiKeyMasked: maskAccessKey(raw.arkApiKey),
    arkApiKeyConfigured: !!String(raw.arkApiKey || '').trim(),
    arkKeysUpdateTime: raw.arkKeysUpdateTime || null,
    seedreamModelId: normalizeSeedreamModelId(raw.seedreamModelId),
    seedreamSizeTier: normalizeSeedreamSizeTier(raw.seedreamSizeTier || DEFAULT_SEEDREAM_SIZE_TIER),
    seedreamOrientation: normalizeSeedreamOrientation(
      raw.seedreamOrientation || DEFAULT_SEEDREAM_ORIENTATION
    ),
    seedreamOutputSizeLabel: describeSeedreamOutputSize(
      raw.seedreamSizeTier || DEFAULT_SEEDREAM_SIZE_TIER,
      raw.seedreamOrientation || DEFAULT_SEEDREAM_ORIENTATION
    ),
    jimengMaxConcurrency: savedJimeng,
    jimengMaxConcurrencyEffective: envJimeng != null ? envJimeng : savedJimeng,
    jimengMaxConcurrencyOverriddenByEnv: envJimeng != null,
    seedreamMaxConcurrency: savedSeedream,
    seedreamMaxConcurrencyEffective: envSeedream != null ? envSeedream : savedSeedream,
    seedreamMaxConcurrencyOverriddenByEnv: envSeedream != null,
    albumEntryMinTotal: album.albumEntryMinTotal,
    albumSelectMin: album.albumSelectMin,
    albumSelectMax: album.albumSelectMax,
    albumPointsPerPhoto: album.albumPointsPerPhoto,
    updateTime: raw.updateTime || null
  }
}

async function updatePlatformSettings(payload) {
  const supportPhone = (payload.supportPhone || '').trim()
  if (supportPhone && !/^[\d\s\-+()]{6,24}$/.test(supportPhone)) {
    throw new Error('平台电话格式不正确')
  }

  const existing = await readPlatformSettingsDoc()
  const portraitEngine = normalizePortraitEngine(
    payload.portraitEngine != null && payload.portraitEngine !== ''
      ? payload.portraitEngine
      : existing.portraitEngine
  )
  const nextArkApiKey = (payload.arkApiKey || '').trim() || String(existing.arkApiKey || '').trim()
  if (portraitEngine === PORTRAIT_ENGINE_SEEDREAM && !nextArkApiKey) {
    throw new Error('选择智绘引擎前，请先配置方舟 API Key')
  }

  const data = {
    supportPhone: supportPhone || existing.supportPhone || '',
    portraitEngine,
    seedreamModelId: normalizeSeedreamModelId(
      payload.seedreamModelId != null && payload.seedreamModelId !== ''
        ? payload.seedreamModelId
        : existing.seedreamModelId
    ),
    seedreamSizeTier: normalizeSeedreamSizeTier(
      payload.seedreamSizeTier != null && payload.seedreamSizeTier !== ''
        ? payload.seedreamSizeTier
        : existing.seedreamSizeTier || DEFAULT_SEEDREAM_SIZE_TIER
    ),
    seedreamOrientation: normalizeSeedreamOrientation(
      payload.seedreamOrientation != null && payload.seedreamOrientation !== ''
        ? payload.seedreamOrientation
        : existing.seedreamOrientation || DEFAULT_SEEDREAM_ORIENTATION
    ),
    jimengMaxConcurrency: clampJimengMaxConcurrency(
      existing.jimengMaxConcurrency != null ? existing.jimengMaxConcurrency : 1
    ),
    seedreamMaxConcurrency: clampSeedreamMaxConcurrency(
      existing.seedreamMaxConcurrency != null ? existing.seedreamMaxConcurrency : 10
    ),
    updateTime: new Date()
  }
  if (existing.volcAccessKey) data.volcAccessKey = existing.volcAccessKey
  if (existing.volcSecretKey) data.volcSecretKey = existing.volcSecretKey
  if (existing.volcKeysUpdateTime) data.volcKeysUpdateTime = existing.volcKeysUpdateTime
  if (existing.arkApiKey) data.arkApiKey = existing.arkApiKey
  if (existing.arkKeysUpdateTime) data.arkKeysUpdateTime = existing.arkKeysUpdateTime

  if (payload.jimengMaxConcurrency != null && payload.jimengMaxConcurrency !== '') {
    data.jimengMaxConcurrency = clampJimengMaxConcurrency(payload.jimengMaxConcurrency)
  }
  if (payload.seedreamMaxConcurrency != null && payload.seedreamMaxConcurrency !== '') {
    data.seedreamMaxConcurrency = clampSeedreamMaxConcurrency(payload.seedreamMaxConcurrency)
  }

  const volcAccessKey = (payload.volcAccessKey || '').trim()
  if (volcAccessKey) {
    data.volcAccessKey = volcAccessKey
    data.volcKeysUpdateTime = new Date()
  }

  const volcSecretKey = (payload.volcSecretKey || '').trim()
  if (volcSecretKey) {
    data.volcSecretKey = volcSecretKey
    data.volcKeysUpdateTime = new Date()
  }

  const arkApiKey = (payload.arkApiKey || '').trim()
  if (arkApiKey) {
    data.arkApiKey = arkApiKey
    data.arkKeysUpdateTime = new Date()
  }

  const album = validateAlbumPlatformConfigPayload({
    albumSelectMin:
      payload.albumSelectMin != null && payload.albumSelectMin !== ''
        ? payload.albumSelectMin
        : existing.albumSelectMin,
    albumSelectMax:
      payload.albumSelectMax != null && payload.albumSelectMax !== ''
        ? payload.albumSelectMax
        : existing.albumSelectMax,
    albumEntryMinTotal:
      payload.albumEntryMinTotal != null && payload.albumEntryMinTotal !== ''
        ? payload.albumEntryMinTotal
        : existing.albumEntryMinTotal,
    albumPointsPerPhoto:
      payload.albumPointsPerPhoto != null && payload.albumPointsPerPhoto !== ''
        ? payload.albumPointsPerPhoto
        : existing.albumPointsPerPhoto
  })
  data.albumEntryMinTotal = album.albumEntryMinTotal
  data.albumSelectMin = album.albumSelectMin
  data.albumSelectMax = album.albumSelectMax
  data.albumPointsPerPhoto = album.albumPointsPerPhoto

  await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).set({ data })
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
    case 'orders.delete':
      return deleteOrder(payload)
    case 'orders.batchDelete':
      return batchDeleteOrders(payload)
    case 'orders.updateShipping':
      return updateOrderShipping(payload)
    case 'orders.export':
      return prepareOrderExport(payload)
    case 'orders.exportImage':
      return fetchOrderExportImage(payload)
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
    case 'styles.prepareSampleUpload':
      return prepareStyleSampleUpload(payload)
    case 'styles.fetchSampleImage':
      return fetchStyleSampleImage(payload)
    case 'styles.generateSample':
      return generateStyleSample(payload)
    case 'styles.discardSamples':
      return discardStyleSamples(payload)
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
    case 'gallery.batches.list':
      return listGalleryBatches({ ...query, ...payload })
    case 'gallery.batches.get':
      return getGalleryBatch(payload)
    case 'gallery.batches.delete':
      return deleteGalleryBatch(payload)
    case 'gallery.batches.batchDelete':
      return batchDeleteGalleryBatches(payload)
    case 'rechargePackages.list':
      return listRechargePackages({ ...query, ...payload })
    case 'rechargePackages.get':
      return getRechargePackage(payload)
    case 'rechargePackages.create':
      return createRechargePackage(payload)
    case 'rechargePackages.update':
      return updateRechargePackage(payload)
    case 'rechargePackages.delete':
      return deleteRechargePackage(payload)
    case 'rechargePackages.seedDefaults':
      return seedDefaultPackages()
    default:
      throw new Error(`未知 action: ${action}`)
  }
}

module.exports = {
  PUBLIC_ACTIONS,
  dispatch,
  verifyToken
}
