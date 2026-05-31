const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTION = 'recharge_packages'

/** 库为空时写入，与后台默认一致 */
const DEFAULT_PACKAGES = [
  {
    id: 1,
    name: '体验套餐',
    times: 10,
    price: 0.5,
    originalPrice: 1,
    tag: '限时5折',
    expireDays: 30,
    sort: 10,
    enabled: true
  },
  {
    id: 2,
    name: '标准套餐',
    times: 50,
    price: 399,
    originalPrice: 599,
    tag: '推荐',
    expireDays: 30,
    sort: 20,
    enabled: true
  },
  {
    id: 3,
    name: '尊享套餐',
    times: 200,
    price: 1299,
    originalPrice: 1999,
    tag: '超值',
    expireDays: 30,
    sort: 30,
    enabled: true
  }
]

let seeding = null

async function seedDefaultPackagesIfEmpty() {
  if (seeding) return seeding
  seeding = (async () => {
    try {
      const countRes = await db.collection(COLLECTION).count()
      if (countRes.total > 0) return
      const now = new Date()
      for (const pkg of DEFAULT_PACKAGES) {
        await db.collection(COLLECTION).add({
          data: { ...pkg, createTime: now, updateTime: now }
        })
      }
    } catch (err) {
      console.warn('[payApi/packages] seed failed', err.message || err)
    }
  })()
  return seeding
}

function toPublicPackage(row) {
  return {
    id: Number(row.id),
    name: row.name,
    times: Number(row.times),
    price: Number(row.price),
    originalPrice: Number(row.originalPrice),
    tag: row.tag || '',
    expireDays: Number(row.expireDays) || 30
  }
}

async function loadAllEnabledFromDb() {
  await seedDefaultPackagesIfEmpty()
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ enabled: true })
      .orderBy('sort', 'desc')
      .orderBy('id', 'asc')
      .limit(100)
      .get()
    return (res.data || []).map(toPublicPackage)
  } catch (err) {
    const res = await db.collection(COLLECTION).where({ enabled: true }).limit(100).get()
    const sorted = (res.data || []).sort((a, b) => {
      const sa = Number(a.sort) || 0
      const sb = Number(b.sort) || 0
      if (sb !== sa) return sb - sa
      return Number(a.id) - Number(b.id)
    })
    return sorted.map(toPublicPackage)
  }
}

async function listPackages() {
  const list = await loadAllEnabledFromDb()
  return list
}

async function getPackageById(packageId) {
  await seedDefaultPackagesIfEmpty()
  const id = Number(packageId)
  if (!id) return null
  try {
    const res = await db.collection(COLLECTION).where({ id, enabled: true }).limit(1).get()
    if (res.data && res.data.length) return toPublicPackage(res.data[0])
  } catch (err) {
    console.warn('[payApi/packages] getPackageById', err.message || err)
  }
  const fallback = DEFAULT_PACKAGES.find((p) => p.id === id)
  return fallback ? toPublicPackage(fallback) : null
}

function yuanToFen(yuan) {
  return Math.round(Number(yuan) * 100)
}

module.exports = {
  DEFAULT_PACKAGES,
  listPackages,
  getPackageById,
  yuanToFen,
  seedDefaultPackagesIfEmpty
}
