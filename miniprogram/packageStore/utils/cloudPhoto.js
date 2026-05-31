/**
 * @file 云存储成片 fileID 选取（开发阶段摆台联调用）
 */

const app = getApp()
const { fetchStyleTemplates } = require('../../config/styles.js')
const { STYLE_TEMPLATES_COLLECTION } = require('../../config/constants.js')

function pickOne(list) {
  if (!list.length) return null
  return list[Math.floor(Math.random() * list.length)]
}

function cloudFileIdFromPhotoRow(row) {
  if (!row) return ''
  const ai = row.aiUrl && String(row.aiUrl).trim()
  const orig = row.originalUrl && String(row.originalUrl).trim()
  if (ai && ai.startsWith('cloud://')) return ai
  if (orig && orig.startsWith('cloud://')) return orig
  return ''
}

/**
 * 从云相册 photos 或风格样板中随机取一张 cloud:// 成片
 * @returns {Promise<string>}
 */
async function pickRandomCloudPhotoFileId() {
  const db = wx.cloud.database()
  const storeId = app.globalData.storeId

  try {
    let query = db.collection('photos')
    if (storeId) {
      query = query.where({ storeId })
    }
    const res = await query.orderBy('createTime', 'desc').limit(30).get()
    const fileIds = res.data.map(cloudFileIdFromPhotoRow).filter(Boolean)
    const picked = pickOne(fileIds)
    if (picked) return picked
  } catch (e) {
    console.warn('[cloudPhoto] 读取 photos 失败', e)
  }

  try {
    const pool = await fetchStyleTemplates(db, {
      collection: STYLE_TEMPLATES_COLLECTION,
      limit: 20,
      onlyEnabled: true
    })
    const withCloud = pool
      .map((s) => s.sampleFileId)
      .filter((id) => id && String(id).startsWith('cloud://'))
    const picked = pickOne(withCloud)
    if (picked) return picked
  } catch (e) {
    console.warn('[cloudPhoto] 读取风格样板失败', e)
  }

  throw new Error('云存储中暂无可用样片，请先上传照片或配置风格图')
}

function isCloudFileId(url) {
  return typeof url === 'string' && url.startsWith('cloud://')
}

module.exports = {
  pickRandomCloudPhotoFileId,
  isCloudFileId,
  cloudFileIdFromPhotoRow
}
