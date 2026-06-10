const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const { getCustomerByOpenId } = require('./register')

const DEFAULT_PAGE_SIZE = 30
const DB_BATCH = 100

function isAiPhotoSuccess(photo) {
  if (!photo) return false
  const st = photo.generateStatus || ''
  if (st === 'completed') return !!(photo.aiUrl || photo.isGenerated)
  return !!(photo.isGenerated && photo.aiUrl)
}

/** 与批次时期一致：直接返回云文件 ID 或 https，不做 getTempFileURL */
function photoDisplayUrl(photo) {
  if (!photo) return ''
  return String(photo.aiUrl || photo.originalUrl || '').trim()
}

function mapAiPhotoRow(photo) {
  const url = photoDisplayUrl(photo)
  if (!url) return null
  return {
    _id: photo._id,
    url,
    styleName: photo.styleName || '',
    createTime: photo.createTime
  }
}

/** 顾客云相册：按张展示该顾客全部 AI 成片，上划分页加载 */
async function listMyGallery(openid, event = {}) {
  const row = await getCustomerByOpenId(openid)
  if (!row) throw new Error('您尚未注册为顾客')

  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(event.pageSize) || DEFAULT_PAGE_SIZE)))
  let dbSkip = Math.max(0, Math.floor(Number(event.dbSkip) || 0))
  const list = []
  let hasMore = true

  while (list.length < pageSize) {
    let res
    try {
      res = await db
        .collection('photos')
        .where({ customerId: row._id })
        .orderBy('createTime', 'desc')
        .skip(dbSkip)
        .limit(DB_BATCH)
        .get()
    } catch (err) {
      console.warn('[gallery.list] orderBy failed, fallback', err.message || err)
      res = await db.collection('photos').where({ customerId: row._id }).limit(500).get()
      const rows = (res.data || []).sort(
        (a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()
      )
      rows.slice(dbSkip).forEach((p) => {
        if (!isAiPhotoSuccess(p) || list.length >= pageSize) return
        const item = mapAiPhotoRow(p)
        if (item) list.push(item)
      })
      hasMore = false
      break
    }

    const rows = res.data || []
    if (!rows.length) {
      hasMore = false
      break
    }
    dbSkip += rows.length
    rows.forEach((p) => {
      if (!isAiPhotoSuccess(p) || list.length >= pageSize) return
      const item = mapAiPhotoRow(p)
      if (item) list.push(item)
    })
    if (rows.length < DB_BATCH) {
      hasMore = false
      break
    }
  }

  return {
    list,
    cursor: { dbSkip },
    hasMore
  }
}

module.exports = { listMyGallery }
