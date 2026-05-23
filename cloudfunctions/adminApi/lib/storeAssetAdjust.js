const { db, _ } = require('./db')
const { sendAdminVerifyCode, verifyAdminCode, PURPOSE_STORE_ASSET } = require('./adminSms')

const COLLECTION = 'store_asset_adjustments'
const ASSET_FIELDS = ['balance', 'packageTotal', 'packageUsed']

function normalizeAssetNumber(value, field) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${fieldLabel(field)}须为不小于 0 的数字`)
  }
  return Math.floor(n)
}

function fieldLabel(field) {
  if (field === 'balance') return '账户余额'
  if (field === 'packageTotal') return '套餐总量'
  if (field === 'packageUsed') return '已用套餐'
  return field
}

function buildChanges(before, afterPayload) {
  const changes = {}
  ASSET_FIELDS.forEach((key) => {
    if (afterPayload[key] === undefined) return
    const next = normalizeAssetNumber(afterPayload[key], key)
    const prev = normalizeAssetNumber(before[key] ?? 0, key)
    if (next !== prev) {
      changes[key] = { before: prev, after: next }
    }
  })
  return changes
}

function validateAfterValues(store, changes) {
  const merged = {
    balance: normalizeAssetNumber(store.balance ?? 0, 'balance'),
    packageTotal: normalizeAssetNumber(store.packageTotal ?? 0, 'packageTotal'),
    packageUsed: normalizeAssetNumber(store.packageUsed ?? 0, 'packageUsed')
  }
  ASSET_FIELDS.forEach((key) => {
    if (changes[key]) merged[key] = changes[key].after
  })
  if (merged.packageUsed > merged.packageTotal) {
    throw new Error('已用套餐不能大于套餐总量')
  }
}

function formatChangeSummary(changes) {
  return Object.keys(changes)
    .map((key) => `${fieldLabel(key)} ${changes[key].before} → ${changes[key].after}`)
    .join('；')
}

async function sendStoreAssetAdjustCode(storeId) {
  if (!storeId) throw new Error('缺少门店 storeId')
  const storeRes = await db.collection('stores').doc(storeId).get()
  if (!storeRes.data) throw new Error('门店不存在')
  return sendAdminVerifyCode({ purpose: PURPOSE_STORE_ASSET, refId: storeId })
}

async function applyStoreAssetAdjustWithCode(storeId, payload, smsCode, adminUser) {
  const reason = String(payload.reason || '').trim()
  if (reason.length < 4) throw new Error('请填写调整原因（至少 4 个字）')

  await verifyAdminCode({
    code: smsCode,
    purpose: PURPOSE_STORE_ASSET,
    refId: storeId
  })

  const storeRes = await db.collection('stores').doc(storeId).get()
  const store = storeRes.data
  if (!store) throw new Error('门店不存在')

  const changes = buildChanges(store, payload)
  if (!Object.keys(changes).length) {
    throw new Error('资产数值与当前一致，无需调整')
  }
  validateAfterValues(store, changes)

  const data = { updateTime: new Date() }
  ASSET_FIELDS.forEach((key) => {
    if (changes[key]) data[key] = changes[key].after
  })

  const now = new Date()
  await db.collection('stores').doc(storeId).update({ data })

  const log = {
    storeId,
    storeName: store.name || '',
    status: 'approved',
    changes,
    changeSummary: formatChangeSummary(changes),
    reason,
    requestedBy: adminUser || 'admin',
    reviewedBy: adminUser || 'admin',
    reviewRemark: '短信验证码确认',
    verifyMethod: 'sms',
    createTime: now,
    reviewTime: now,
    applyTime: now
  }
  const addRes = await db.collection(COLLECTION).add({ data: log })

  const updated = await db.collection('stores').doc(storeId).get()
  return {
    adjustment: { _id: addRes._id, ...log },
    store: updated.data
  }
}

async function listStoreAssetAdjustments(query) {
  const storeId = (query.storeId || '').trim()
  const status = (query.status || '').trim()
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize) || 20))
  const skip = (page - 1) * pageSize

  let coll = db.collection(COLLECTION)
  if (storeId && status) {
    coll = coll.where(_.and([{ storeId }, { status }]))
  } else if (storeId) {
    coll = coll.where({ storeId })
  } else if (status) {
    coll = coll.where({ status })
  }

  const [countRes, listRes] = await Promise.all([
    coll.count(),
    coll.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get()
  ])

  return {
    list: listRes.data,
    total: countRes.total,
    page,
    pageSize
  }
}

module.exports = {
  ASSET_FIELDS,
  sendStoreAssetAdjustCode,
  applyStoreAssetAdjustWithCode,
  listStoreAssetAdjustments,
  formatChangeSummary
}
