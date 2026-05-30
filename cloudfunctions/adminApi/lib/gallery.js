const cloud = require('wx-server-sdk')
const { db, _, parsePage } = require('./db')
const { deleteCloudFilesSafe, isCloudFileId } = require('./cloudFile')

const BATCH_STATUS_LABEL = {
  pending: '待生成',
  generating: '生成中',
  completed: '已完成',
  partial: '部分失败'
}

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

function deriveBatchStatus(photos) {
  const photoCount = photos.length
  if (!photoCount) {
    return { status: 'pending', generatedCount: 0, photoCount: 0, progressPercent: 0 }
  }
  let generatedCount = 0
  let hasActive = false
  let hasFailed = false
  photos.forEach((p) => {
    const gs = p.generateStatus
    if (gs === 'failed') hasFailed = true
    if (gs === 'pending' || gs === 'processing') hasActive = true
    if (p.isGenerated || gs === 'completed' || p.aiUrl) generatedCount += 1
  })
  let status = 'pending'
  if (hasActive || (generatedCount > 0 && generatedCount < photoCount)) {
    status = 'generating'
  } else if (generatedCount >= photoCount) {
    status = hasFailed ? 'partial' : 'completed'
  }
  const progressPercent = Math.min(100, Math.round((generatedCount / photoCount) * 100))
  return { status, generatedCount, photoCount, progressPercent }
}

function requireStoreId(storeId) {
  const id = String(storeId || '').trim()
  if (!id || !/^store_/i.test(id)) throw new Error('请先在后台选择门店')
  return id
}

async function resolveTempUrlMap(fileIds) {
  const cloudIds = [...new Set((fileIds || []).filter(isCloudFileId))]
  const map = {}
  if (!cloudIds.length) return map
  const chunkSize = 50
  for (let i = 0; i < cloudIds.length; i += chunkSize) {
    const chunk = cloudIds.slice(i, i + chunkSize)
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk })
      ;(res.fileList || []).forEach((item) => {
        if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL
      })
    } catch (err) {
      console.warn('[gallery] getTempFileURL', err.message || err)
    }
  }
  return map
}

async function loadPhotosByBatchIds(batchIds) {
  const map = {}
  if (!batchIds.length) return map
  for (let i = 0; i < batchIds.length; i += 20) {
    const chunk = batchIds.slice(i, i + 20)
    const res = await db.collection('photos').where({ batchId: _.in(chunk) }).limit(500).get()
    ;(res.data || []).forEach((p) => {
      if (!map[p.batchId]) map[p.batchId] = []
      map[p.batchId].push(p)
    })
  }
  return map
}

async function loadCustomerNameMap(customerIds) {
  const map = {}
  const ids = [...new Set((customerIds || []).filter(Boolean))]
  if (!ids.length) return map
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20)
    const res = await db.collection('customers').where({ _id: _.in(chunk) }).get()
    ;(res.data || []).forEach((c) => {
      const name = (c.nickName || c.wxNickName || '').trim() || '匿名用户'
      map[c._id] = name
    })
  }
  return map
}

function pickCoverFileId(photos, batch) {
  const sorted = [...photos].sort((a, b) => {
    const ta = new Date(a.createTime || 0).getTime()
    const tb = new Date(b.createTime || 0).getTime()
    return ta - tb
  })
  const withAi = sorted.filter((p) => p.aiUrl || p.isGenerated)
  const cover = withAi[withAi.length - 1] || sorted[0]
  if (cover) return cover.aiUrl || cover.originalUrl || ''
  const ids = batch && batch.photoIds
  if (Array.isArray(ids) && ids.length) return ids[ids.length - 1]
  return ''
}

function formatBatchRow(batch, photos, customerMap, urlMap) {
  const sorted = [...photos].sort((a, b) => {
    const ta = new Date(a.createTime || 0).getTime()
    const tb = new Date(b.createTime || 0).getTime()
    return ta - tb
  })
  const meta = deriveBatchStatus(sorted)
  const coverFileId = pickCoverFileId(sorted, batch)
  const styles = [...new Set(sorted.map((p) => (p.styleName || '').trim()).filter(Boolean))]
  return {
    _id: batch._id,
    storeId: batch.storeId,
    customerId: batch.customerId || '',
    customerName: customerMap[batch.customerId] || '—',
    createTime: batch.createTime,
    createTimeText: formatDateTime(batch.createTime),
    status: meta.status,
    statusLabel: BATCH_STATUS_LABEL[meta.status] || meta.status,
    photoCount: meta.photoCount,
    generatedCount: meta.generatedCount,
    progressPercent: meta.progressPercent,
    coverFileId,
    coverUrl: urlMap[coverFileId] || '',
    styleSummary: styles.length ? styles.slice(0, 3).join(' · ') : '—'
  }
}

function formatPhotoRow(photo, urlMap) {
  const originalUrl = photo.originalUrl || ''
  const aiUrl = photo.aiUrl || ''
  return {
    _id: photo._id,
    batchId: photo.batchId,
    styleId: photo.styleId || '',
    styleName: photo.styleName || '',
    originalUrl,
    aiUrl,
    originalDisplayUrl: urlMap[originalUrl] || originalUrl,
    aiDisplayUrl: urlMap[aiUrl] || aiUrl,
    isGenerated: !!photo.isGenerated,
    generateStatus: photo.generateStatus || '',
    isFavorite: !!photo.isFavorite,
    createTimeText: formatDateTime(photo.createTime)
  }
}

async function listGalleryBatches(query) {
  const storeId = requireStoreId(query.storeId)
  const { page, pageSize, skip } = parsePage(query)

  let coll = db.collection('batches').where({ storeId })
  const [listRes, countRes] = await Promise.all([
    coll.orderBy('createTime', 'desc').skip(skip).limit(pageSize).get(),
    coll.count()
  ])
  const batches = listRes.data || []
  const batchIds = batches.map((b) => b._id)
  const photoMap = await loadPhotosByBatchIds(batchIds)
  const customerMap = await loadCustomerNameMap(batches.map((b) => b.customerId))

  const coverIds = batches.map((b) => pickCoverFileId(photoMap[b._id] || [], b))
  const urlMap = await resolveTempUrlMap(coverIds)

  const list = batches.map((batch) =>
    formatBatchRow(batch, photoMap[batch._id] || [], customerMap, urlMap)
  )

  return { list, total: countRes.total, page, pageSize }
}

async function getGalleryBatch(payload) {
  const batchId = String(payload.batchId || payload._id || payload.id || '').trim()
  if (!batchId) throw new Error('缺少批次 ID')
  const storeId = requireStoreId(payload.storeId)

  let batch
  try {
    const res = await db.collection('batches').doc(batchId).get()
    batch = res.data
  } catch (e) {
    batch = null
  }
  if (!batch || batch.storeId !== storeId) throw new Error('批次不存在或不属于当前门店')

  const photosRes = await db.collection('photos').where({ batchId }).get()
  const photos = photosRes.data || []
  const customerMap = await loadCustomerNameMap([batch.customerId])
  const fileIds = []
  photos.forEach((p) => {
    if (p.originalUrl) fileIds.push(p.originalUrl)
    if (p.aiUrl) fileIds.push(p.aiUrl)
  })
  if (Array.isArray(batch.photoIds)) fileIds.push(...batch.photoIds)
  const urlMap = await resolveTempUrlMap(fileIds)

  return {
    batch: formatBatchRow(batch, photos, customerMap, urlMap),
    photos: photos
      .sort((a, b) => new Date(a.createTime || 0) - new Date(b.createTime || 0))
      .map((p) => formatPhotoRow(p, urlMap))
  }
}

function collectBatchFileIds(batch, photos, tasks) {
  const ids = new Set()
  ;(photos || []).forEach((p) => {
    if (isCloudFileId(p.originalUrl)) ids.add(p.originalUrl)
    if (isCloudFileId(p.aiUrl)) ids.add(p.aiUrl)
  })
  if (Array.isArray(batch.photoIds)) {
    batch.photoIds.forEach((id) => {
      if (isCloudFileId(id)) ids.add(id)
    })
  }
  ;(tasks || []).forEach((t) => {
    if (isCloudFileId(t.resultFileID)) ids.add(t.resultFileID)
  })
  return [...ids]
}

async function assertNoFrameOrdersForFiles(storeId, fileIds) {
  const list = [...new Set((fileIds || []).filter(isCloudFileId))]
  if (!list.length) return
  for (let i = 0; i < list.length; i += 20) {
    const chunk = list.slice(i, i + 20)
    const res = await db
      .collection('frame_orders')
      .where({ storeId, photoUrl: _.in(chunk) })
      .limit(1)
      .get()
    if (res.data && res.data.length) {
      throw new Error('该批次照片已被摆台订单引用，请先在「订单管理」处理相关订单后再删除')
    }
  }
}

async function removeDocsByIds(collection, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  for (const id of unique) {
    try {
      await db.collection(collection).doc(id).remove()
    } catch (err) {
      console.warn(`[gallery] remove ${collection}`, id, err.message || err)
    }
  }
}

async function loadAiTasksForBatch(batchId, photoIds) {
  const tasks = []
  const byBatch = await db.collection('ai_tasks').where({ batchId }).limit(500).get()
  tasks.push(...(byBatch.data || []))

  const seen = new Set(tasks.map((t) => t._id))
  for (let i = 0; i < photoIds.length; i += 20) {
    const chunk = photoIds.slice(i, i + 20)
    if (!chunk.length) continue
    const res = await db.collection('ai_tasks').where({ photoId: _.in(chunk) }).limit(500).get()
    ;(res.data || []).forEach((t) => {
      if (!seen.has(t._id)) {
        seen.add(t._id)
        tasks.push(t)
      }
    })
  }
  return tasks
}

async function deleteGalleryBatch(payload) {
  const batchId = String(payload.batchId || payload._id || payload.id || '').trim()
  if (!batchId) throw new Error('缺少批次 ID')
  const storeId = requireStoreId(payload.storeId)

  let batch
  try {
    const res = await db.collection('batches').doc(batchId).get()
    batch = res.data
  } catch (e) {
    batch = null
  }
  if (!batch || batch.storeId !== storeId) throw new Error('批次不存在或不属于当前门店')

  const photosRes = await db.collection('photos').where({ batchId }).get()
  const photos = photosRes.data || []
  const photoIds = photos.map((p) => p._id)
  const tasks = await loadAiTasksForBatch(batchId, photoIds)
  const fileIds = collectBatchFileIds(batch, photos, tasks)

  await assertNoFrameOrdersForFiles(storeId, fileIds)

  await removeDocsByIds(
    'ai_tasks',
    tasks.map((t) => t._id)
  )
  await removeDocsByIds('photos', photoIds)
  try {
    await db.collection('batches').doc(batchId).remove()
  } catch (err) {
    throw new Error('删除批次记录失败')
  }
  await deleteCloudFilesSafe(fileIds)

  return {
    batchId,
    deletedPhotos: photoIds.length,
    deletedTasks: tasks.length,
    deletedFiles: fileIds.length
  }
}

module.exports = {
  listGalleryBatches,
  getGalleryBatch,
  deleteGalleryBatch
}
