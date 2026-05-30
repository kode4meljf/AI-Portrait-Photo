const { db } = require('./db')
const { deleteCloudFileSafe, deleteCloudFilesSafe, isCloudFileId, isPlatformManagedCloudFile } = require('./cloudFile')

function requireStoreId(storeId) {
  const id = String(storeId || '').trim()
  if (!id || !/^store_/i.test(id)) throw new Error('请先在后台选择门店')
  return id
}

function collectOrderPortraitFileIds(order) {
  const ids = new Set()
  const main = String(order.photoUrl || '').trim()
  if (isCloudFileId(main)) ids.add(main)
  if (Array.isArray(order.photos)) {
    order.photos.forEach((item) => {
      const id = String(item || '').trim()
      if (isCloudFileId(id)) ids.add(id)
    })
  }
  return [...ids]
}

async function isPortraitFileReferencedByOrders(photoUrl) {
  const url = String(photoUrl || '').trim()
  if (!url) return false
  const res = await db.collection('frame_orders').where({ photoUrl: url }).limit(1).get()
  return !!(res.data && res.data.length)
}

async function removeDocsByIds(collection, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))]
  for (const id of unique) {
    try {
      await db.collection(collection).doc(id).remove()
    } catch (err) {
      console.warn(`[orders] remove ${collection}`, id, err.message || err)
    }
  }
}

async function cleanupPhotosAndTasksForPortrait(photoUrl) {
  const photosRes = await db.collection('photos').where({ aiUrl: photoUrl }).limit(50).get()
  const photos = photosRes.data || []
  let clearedPhotos = 0
  let deletedTasks = 0
  const extraFileIds = new Set()

  for (const photo of photos) {
    await db.collection('photos').doc(photo._id).update({
      data: {
        aiUrl: null,
        isGenerated: false,
        generateStatus: 'pending',
        errorMsg: null,
        updateTime: db.serverDate()
      }
    })
    clearedPhotos += 1

    const tasksRes = await db.collection('ai_tasks').where({ photoId: photo._id }).limit(100).get()
    for (const task of tasksRes.data || []) {
      if (isCloudFileId(task.resultFileID) && task.resultFileID !== photoUrl) {
        extraFileIds.add(task.resultFileID)
      }
      deletedTasks += 1
    }
    await removeDocsByIds(
      'ai_tasks',
      (tasksRes.data || []).map((t) => t._id)
    )
  }

  if (extraFileIds.size) {
    const batch = await deleteCloudFilesSafe([...extraFileIds])
    deletedExtraFiles += batch.deleted || 0
  }

  return { clearedPhotos, deletedTasks, extraFiles: extraFileIds.size }
}

/**
 * 删除摆台订单：不退 balance；无其它订单引用时删除成片云文件并清理 photos/ai_tasks
 */
async function deleteOrder(payload) {
  const orderId = String(payload.orderId || payload._id || '').trim()
  const storeId = requireStoreId(payload.storeId)
  if (!orderId) throw new Error('缺少 orderId')

  let order
  try {
    const res = await db.collection('frame_orders').doc(orderId).get()
    order = res.data
  } catch (e) {
    order = null
  }
  if (!order || order.storeId !== storeId) {
    throw new Error('订单不存在或不属于当前门店')
  }

  const portraitFileIds = collectOrderPortraitFileIds(order)

  await db.collection('frame_orders').doc(orderId).remove()

  let deletedPortraitFiles = 0
  let clearedPhotos = 0
  let deletedTasks = 0
  let deletedExtraFiles = 0
  let skippedProtectedFiles = 0

  for (const fileId of portraitFileIds) {
    const stillReferenced = await isPortraitFileReferencedByOrders(fileId)
    if (stillReferenced) continue

    if (await isPlatformManagedCloudFile(fileId)) {
      skippedProtectedFiles += 1
      console.warn('[orders] skip portrait delete, platform asset', fileId)
      continue
    }

    const cleanup = await cleanupPhotosAndTasksForPortrait(fileId)
    clearedPhotos += cleanup.clearedPhotos
    deletedTasks += cleanup.deletedTasks
    deletedExtraFiles += cleanup.extraFiles

    const deleted = await deleteCloudFileSafe(fileId)
    if (deleted) deletedPortraitFiles += 1
  }

  return {
    orderId,
    orderNo: order.orderNo || '',
    deleted: true,
    deletedPortraitFiles,
    clearedPhotos,
    deletedTasks,
    deletedExtraFiles,
    skippedProtectedFiles
  }
}

module.exports = {
  deleteOrder
}
