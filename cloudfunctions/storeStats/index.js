const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function toDateString(value) {
  const d = value instanceof Date ? value : new Date(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dayRangeMs(dateStr) {
  const start = new Date(`${dateStr}T00:00:00`)
  const startMs = start.getTime()
  return { startMs, endMs: startMs + 86400000 - 1 }
}

async function getTodayUnchecked(storeId, dateStr, checkedIds) {
  const customersRes = await db
    .collection('customers')
    .where({ storeId })
    .field({ customerId: true, _id: true })
    .limit(1000)
    .get()

  let unchecked = 0
  for (const c of customersRes.data || []) {
    const key = (c.customerId || c._id || '').trim()
    if (!key || checkedIds.has(key)) continue
    unchecked += 1
  }
  return unchecked
}

/** 当日打卡记录按 customerId 去重 */
async function fetchCheckedIdSet(storeId, dateStr) {
  const { startMs, endMs } = dayRangeMs(dateStr)

  const res = await db
    .collection('checkins')
    .where({
      storeId,
      createTime: _.gte(startMs).and(_.lte(endMs))
    })
    .field({ customerId: true, customerDocId: true })
    .limit(1000)
    .get()

  const ids = new Set()
  for (const row of res.data || []) {
    const id = (row.customerId || row.customerDocId || '').trim()
    if (id) ids.add(id)
  }
  return ids
}

async function getOrderStats(event) {
  const { startDate, endDate } = event
  try {
    // TODO: 按 startDate / endDate 聚合 frame_orders
    return {
      totalAmount: 0,
      frameCount: 0,
      albumCount: 0,
      videoCount: 0,
      memoirCount: 0
    }
  } catch (err) {
    console.error('[storeStats] order', err)
    return {
      totalAmount: 0,
      frameCount: 0,
      albumCount: 0,
      videoCount: 0,
      memoirCount: 0
    }
  }
}

async function getCheckinStats(event) {
  const storeId = (event.storeId || '').trim()
  if (!storeId) {
    return { yesterdayCount: 0, todayCount: 0, todayUnchecked: 0 }
  }

  try {
    const today = toDateString(new Date())
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = toDateString(yesterdayDate)

    const [todayIds, yesterdayIds] = await Promise.all([
      fetchCheckedIdSet(storeId, today),
      fetchCheckedIdSet(storeId, yesterday)
    ])

    const todayCount = todayIds.size
    const yesterdayCount = yesterdayIds.size
    const todayUnchecked = await getTodayUnchecked(storeId, today, todayIds)

    return { yesterdayCount, todayCount, todayUnchecked }
  } catch (err) {
    console.error('[storeStats] checkin', err)
    return {
      yesterdayCount: 0,
      todayCount: 0,
      todayUnchecked: 0
    }
  }
}

exports.main = async (event) => {
  const action = event.action || ''
  if (action === 'order') {
    return getOrderStats(event)
  }
  if (action === 'checkin') {
    return getCheckinStats(event)
  }
  return {
    success: false,
    error: '未知 action，请使用 order 或 checkin'
  }
}
