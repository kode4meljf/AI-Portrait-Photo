const cloud = require('wx-server-sdk')
const { resolvePackagePoints } = require('./points')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTION = 'recharge_packages'

/** 门店充值页展示的套餐 id（与设计稿一致，共 4 档） */
const RECHARGE_CATALOG_IDS = [1, 3, 5, 6]

function toPublicPackage(row) {
  const points = resolvePackagePoints(row)
  return {
    id: Number(row.id),
    name: row.name,
    points,
    bonusPoints: Number(row.bonusPoints) || 0,
    times: points,
    price: Number(row.price),
    originalPrice: Number(row.originalPrice),
    tag: row.tag || '',
    slogan: row.slogan || '',
    group: row.group || '',
    badge: row.badge || '',
    expireDays: Number(row.expireDays) || 365
  }
}

function isCatalogPackage(row) {
  return RECHARGE_CATALOG_IDS.includes(Number(row.id))
}

async function loadAllEnabledFromDb() {
  try {
    const res = await db
      .collection(COLLECTION)
      .where({ enabled: true })
      .orderBy('sort', 'desc')
      .orderBy('id', 'asc')
      .limit(100)
      .get()
    return (res.data || []).filter(isCatalogPackage).map(toPublicPackage)
  } catch (err) {
    const res = await db.collection(COLLECTION).where({ enabled: true }).limit(100).get()
    const sorted = (res.data || [])
      .filter(isCatalogPackage)
      .sort((a, b) => {
        const sa = Number(a.sort) || 0
        const sb = Number(b.sort) || 0
        if (sb !== sa) return sb - sa
        return Number(a.id) - Number(b.id)
      })
    return sorted.map(toPublicPackage)
  }
}

async function listPackages() {
  return await loadAllEnabledFromDb()
}

async function getPackageById(packageId) {
  const id = Number(packageId)
  if (!id || !RECHARGE_CATALOG_IDS.includes(id)) return null
  try {
    const res = await db.collection(COLLECTION).where({ id, enabled: true }).limit(1).get()
    if (res.data && res.data.length) return toPublicPackage(res.data[0])
  } catch (err) {
    console.warn('[payApi/packages] getPackageById', err.message || err)
  }
  return null
}

function yuanToFen(yuan) {
  return Math.round(Number(yuan) * 100)
}

module.exports = {
  RECHARGE_CATALOG_IDS,
  listPackages,
  getPackageById,
  yuanToFen,
  resolvePackagePoints
}
