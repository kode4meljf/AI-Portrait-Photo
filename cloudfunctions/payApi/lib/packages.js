const cloud = require('wx-server-sdk')
const { resolvePackagePoints } = require('./points')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTION = 'recharge_packages'

/** 门店充值页展示的套餐 id（与设计稿一致，共 4 档） */
const RECHARGE_CATALOG_IDS = [1, 3, 5, 6]

/** 库为空时写入（10 积分 = 1 元；points 为到账总积分含赠送） */
const DEFAULT_PACKAGES = [
  {
    id: 1,
    name: '尝鲜包',
    points: 30,
    bonusPoints: 0,
    price: 3,
    originalPrice: 3,
    slogan: '新客试拍，低门槛体验',
    group: 'casual',
    tag: '1人9张',
    expireDays: 365,
    sort: 10,
    enabled: true
  },
  {
    id: 3,
    name: '优享包',
    points: 860,
    bonusPoints: 80,
    price: 78,
    originalPrice: 90,
    slogan: '客流稳定，性价比之选',
    group: 'casual',
    tag: '约28人',
    expireDays: 365,
    sort: 30,
    enabled: true
  },
  {
    id: 5,
    name: '至尊套餐',
    points: 21800,
    bonusPoints: 2000,
    price: 1980,
    originalPrice: 1980,
    slogan: '年度主推 · 会员价 + 约 10% 赠送',
    group: 'annual',
    badge: 'hot',
    tag: '至尊会员',
    expireDays: 365,
    sort: 100,
    enabled: true
  },
  {
    id: 6,
    name: '荣耀套餐',
    points: 44800,
    bonusPoints: 5000,
    price: 3980,
    originalPrice: 3980,
    slogan: '高客流门店 · 约 12% 赠送',
    group: 'annual',
    badge: 'crown',
    tag: '荣耀会员',
    expireDays: 365,
    sort: 110,
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
  await seedDefaultPackagesIfEmpty()
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
  const list = await loadAllEnabledFromDb()
  if (list.length) return list
  return DEFAULT_PACKAGES.map(toPublicPackage)
}

async function getPackageById(packageId) {
  await seedDefaultPackagesIfEmpty()
  const id = Number(packageId)
  if (!id || !RECHARGE_CATALOG_IDS.includes(id)) return null
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
  RECHARGE_CATALOG_IDS,
  DEFAULT_PACKAGES,
  listPackages,
  getPackageById,
  yuanToFen,
  seedDefaultPackagesIfEmpty,
  resolvePackagePoints
}
