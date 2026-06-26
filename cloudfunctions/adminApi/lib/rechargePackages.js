const { db, _, parsePage } = require('./db')

const COLLECTION = 'recharge_packages'

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

function resolveRowPoints(row) {
  if (row.points != null && row.points !== '') return Number(row.points) || 0
  return Number(row.times) || 0
}

function formatRow(row) {
  const points = resolveRowPoints(row)
  return {
    ...row,
    points,
    times: points,
    enabled: row.enabled !== false,
    createTimeText: formatDateTime(row.createTime),
    updateTimeText: formatDateTime(row.updateTime)
  }
}

function normalizePayload(payload, isCreate) {
  const name = String(payload.name || '').trim()
  if (!name) throw new Error('请填写套餐名称')

  const pointsRaw = payload.points != null ? payload.points : payload.times
  const points = Math.floor(Number(pointsRaw))
  if (!points || points < 1) throw new Error('积分须为大于 0 的整数')

  const price = Number(payload.price)
  if (Number.isNaN(price) || price < 0) throw new Error('售价不能为负数')

  const originalPrice = Number(payload.originalPrice)
  if (Number.isNaN(originalPrice) || originalPrice < 0) throw new Error('原价不能为负数')

  const expireDays = Math.floor(Number(payload.expireDays) || 365)
  if (expireDays < 1 || expireDays > 3650) throw new Error('有效期须在 1～3650 天之间')

  const data = {
    name,
    points,
    times: points,
    price,
    originalPrice,
    tag: String(payload.tag || '').trim(),
    expireDays,
    sort: Number(payload.sort) || 0,
    enabled: payload.enabled !== false,
    updateTime: new Date()
  }

  if (isCreate) {
    data.createTime = new Date()
  }

  return data
}

async function assertNameUnique(name, excludeDocId) {
  const res = await db.collection(COLLECTION).where({ name }).limit(20).get()
  const hit = (res.data || []).find((row) => row._id !== excludeDocId)
  if (hit) throw new Error(`套餐名称「${name}」已存在`)
}

async function nextPackageId() {
  const res = await db.collection(COLLECTION).orderBy('id', 'desc').limit(1).get()
  const maxId = res.data && res.data.length ? Number(res.data[0].id) || 0 : 0
  return maxId + 1
}

async function seedDefaultPackages() {
  const countRes = await db.collection(COLLECTION).count()
  if (countRes.total > 0) {
    return { seeded: 0, message: '已有套餐数据，未写入默认项' }
  }
  return { seeded: 0, message: '已无内置默认套餐，请通过「新增套餐」手动创建' }
}

async function listRechargePackages(query) {
  const { page, pageSize, skip } = parsePage(query)
  const keyword = (query.keyword || '').trim()

  let coll = db.collection(COLLECTION)
  if (keyword) {
    const num = Number(keyword)
    const or = [
      { name: db.RegExp({ regexp: keyword, options: 'i' }) },
      { tag: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]
    if (!Number.isNaN(num) && String(num) === keyword) {
      or.push({ id: num })
    }
    coll = coll.where(_.or(or))
  }

  let list = []
  let total = 0
  let enabledCount = 0
  try {
    const [listRes, countRes, enabledRes] = await Promise.all([
      coll.orderBy('sort', 'desc').orderBy('id', 'asc').skip(skip).limit(pageSize).get(),
      coll.count(),
      db.collection(COLLECTION).where({ enabled: true }).count()
    ])
    list = listRes.data || []
    total = countRes.total
    enabledCount = enabledRes.total
  } catch (err) {
    const allRes = await coll.limit(200).get()
    const sorted = (allRes.data || []).sort((a, b) => {
      const sa = Number(a.sort) || 0
      const sb = Number(b.sort) || 0
      if (sb !== sa) return sb - sa
      return Number(a.id) - Number(b.id)
    })
    total = sorted.length
    enabledCount = sorted.filter((r) => r.enabled !== false).length
    list = sorted.slice(skip, skip + pageSize)
  }

  return {
    list: list.map(formatRow),
    total,
    page,
    pageSize,
    enabledCount
  }
}

async function getRechargePackage(payload) {
  const docId = payload._id || payload.id
  if (!docId) throw new Error('缺少套餐 ID')
  const res = await db.collection(COLLECTION).doc(docId).get()
  if (!res.data) throw new Error('套餐不存在')
  return formatRow(res.data)
}

async function createRechargePackage(payload) {
  const data = normalizePayload(payload, true)
  await assertNameUnique(data.name)
  const id = await nextPackageId()
  data.id = id
  const addRes = await db.collection(COLLECTION).add({ data })
  const res = await db.collection(COLLECTION).doc(addRes._id).get()
  return formatRow(res.data)
}

async function updateRechargePackage(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')
  const current = await db.collection(COLLECTION).doc(docId).get()
  if (!current.data) throw new Error('套餐不存在')

  const data = normalizePayload(payload, false)
  await assertNameUnique(data.name, docId)
  if (payload.id !== undefined && Number(payload.id) !== Number(current.data.id)) {
    throw new Error('套餐编号不可修改')
  }
  data.id = current.data.id

  await db.collection(COLLECTION).doc(docId).update({ data })
  return getRechargePackage({ _id: docId })
}

async function deleteRechargePackage(payload) {
  const docId = payload._id
  if (!docId) throw new Error('缺少 _id')
  const current = await db.collection(COLLECTION).doc(docId).get()
  if (!current.data) throw new Error('套餐不存在')

  await db.collection(COLLECTION).doc(docId).remove()
  return { _id: docId, id: current.data.id, deleted: true }
}

module.exports = {
  COLLECTION,
  listRechargePackages,
  getRechargePackage,
  createRechargePackage,
  updateRechargePackage,
  deleteRechargePackage,
  seedDefaultPackages
}
