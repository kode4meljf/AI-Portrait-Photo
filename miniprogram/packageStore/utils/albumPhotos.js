/**
 * 客户 AI 写真成片查询（photos 集合）
 */
const {
  ALBUM_ENTRY_MIN_TOTAL,
  ALBUM_PHOTO_PAGE_SIZE
} = require('../../utils/albumConstants')

const MP_PAGE_SIZE = 20

function isAiPhotoSuccess(photo) {
  if (!photo) return false
  const st = photo.generateStatus || ''
  if (st === 'completed') return !!(photo.aiUrl || photo.isGenerated)
  return !!(photo.isGenerated && photo.aiUrl)
}

function photoDisplayUrl(photo) {
  const ai = photo.aiUrl && String(photo.aiUrl).trim()
  if (ai) return ai
  return ''
}

function mapAlbumPhotoRow(photo) {
  return {
    _id: photo._id,
    url: photoDisplayUrl(photo),
    styleName: photo.styleName || '',
    createTime: photo.createTime
  }
}

async function fetchPhotoBatch(db, storeId, customerId, skip) {
  return db
    .collection('photos')
    .where({ storeId, customerId })
    .orderBy('createTime', 'desc')
    .skip(skip)
    .limit(MP_PAGE_SIZE)
    .get()
}

/** 统计客户 AI 成片数量（达到准入阈值即可提前返回） */
async function countCustomerAiPhotos(db, storeId, customerId, entryMinTotal) {
  const threshold =
    Number.isFinite(Number(entryMinTotal)) && Number(entryMinTotal) > 0
      ? Math.floor(Number(entryMinTotal))
      : ALBUM_ENTRY_MIN_TOTAL
  let total = 0
  let skip = 0
  while (true) {
    const res = await fetchPhotoBatch(db, storeId, customerId, skip)
    const rows = res.data || []
    if (!rows.length) break
    total += rows.filter(isAiPhotoSuccess).length
    if (total >= threshold) return total
    skip += rows.length
    if (rows.length < MP_PAGE_SIZE) break
  }
  return total
}

/**
 * 分页加载 AI 成片（每次尽量返回 pageSize 条成功成片）
 */
async function loadCustomerAiPhotoPage(db, storeId, customerId, cursor = {}) {
  let dbSkip = Number(cursor.dbSkip) || 0
  const items = []
  let hasMore = true

  while (items.length < ALBUM_PHOTO_PAGE_SIZE) {
    const res = await fetchPhotoBatch(db, storeId, customerId, dbSkip)
    const rows = res.data || []
    if (!rows.length) {
      hasMore = false
      break
    }
    dbSkip += rows.length
    rows.forEach((row) => {
      if (isAiPhotoSuccess(row) && items.length < ALBUM_PHOTO_PAGE_SIZE) {
        items.push(mapAlbumPhotoRow(row))
      }
    })
    if (rows.length < MP_PAGE_SIZE) {
      hasMore = false
      break
    }
  }

  return {
    items,
    cursor: { dbSkip },
    hasMore
  }
}

module.exports = {
  isAiPhotoSuccess,
  countCustomerAiPhotos,
  loadCustomerAiPhotoPage,
  photoDisplayUrl
}
