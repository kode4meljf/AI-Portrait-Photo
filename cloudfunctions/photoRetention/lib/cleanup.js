const cloud = require('wx-server-sdk')
const { isCloudFileId, deleteCloudFileSafe } = require('./cloudFile')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/** 拍摄原图保留天数（与隐私政策一致） */
const RETENTION_DAYS = 7
const BATCH_SIZE = 100
const MAX_ROUNDS = 20

function isShootOriginalPath(fileId) {
  const id = String(fileId || '')
  return id.includes('/photos/')
}

/**
 * 清理超过保留期的拍摄原图：
 * - 删除云存储 originalUrl 文件
 * - 清空 photos 记录中的 originalUrl，保留 aiUrl 成片
 */
async function cleanupExpiredOriginals(options = {}) {
  const retentionDays = Number(options.retentionDays) > 0 ? Number(options.retentionDays) : RETENTION_DAYS
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const cutoffDate = new Date(cutoffMs)

  let scanned = 0
  let clearedPhotos = 0
  let deletedFiles = 0
  let skippedFiles = 0
  let rounds = 0

  while (rounds < MAX_ROUNDS) {
    rounds += 1
    const res = await db
      .collection('photos')
      .where({
        createTime: _.lte(cutoffDate),
        originalClearedAt: _.exists(false),
      })
      .orderBy('createTime', 'asc')
      .limit(BATCH_SIZE)
      .get()

    const batch = res.data || []
    if (!batch.length) break

    scanned += batch.length

    const withOriginal = []
    const withoutOriginal = []
    for (const photo of batch) {
      const originalUrl = String(photo.originalUrl || '').trim()
      if (originalUrl) withOriginal.push(photo)
      else withoutOriginal.push(photo)
    }

    const now = db.serverDate()
    for (const photo of withoutOriginal) {
      try {
        await db.collection('photos').doc(photo._id).update({
          data: { originalClearedAt: now, updateTime: now },
        })
        clearedPhotos += 1
      } catch (err) {
        console.warn('[photoRetention] mark cleared failed', photo._id, err.message || err)
      }
    }

    /** originalUrl -> photo docs */
    const groups = new Map()
    for (const photo of withOriginal) {
      const originalUrl = String(photo.originalUrl || '').trim()
      if (!groups.has(originalUrl)) groups.set(originalUrl, [])
      groups.get(originalUrl).push(photo)
    }

    for (const [originalUrl, photos] of groups.entries()) {
      const stillFresh = await db
        .collection('photos')
        .where({
          originalUrl,
          createTime: _.gt(cutoffDate),
        })
        .limit(1)
        .get()

      if (stillFresh.data && stillFresh.data.length) {
        skippedFiles += 1
        continue
      }

      if (isCloudFileId(originalUrl) && isShootOriginalPath(originalUrl)) {
        const ok = await deleteCloudFileSafe(originalUrl)
        if (ok) deletedFiles += 1
        else skippedFiles += 1
      }

      for (const photo of photos) {
        try {
          await db.collection('photos').doc(photo._id).update({
            data: {
              originalUrl: '',
              originalClearedAt: now,
              updateTime: now,
            },
          })
          clearedPhotos += 1
        } catch (err) {
          console.warn('[photoRetention] update photo failed', photo._id, err.message || err)
        }
      }
    }

    if (batch.length < BATCH_SIZE) break
  }

  return {
    retentionDays,
    cutoff: cutoffDate.toISOString(),
    scanned,
    clearedPhotos,
    deletedFiles,
    skippedFiles,
    rounds,
  }
}

module.exports = {
  RETENTION_DAYS,
  cleanupExpiredOriginals,
}
