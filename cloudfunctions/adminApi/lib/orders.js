const { db, _ } = require('./db')
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

function resolveOrderCollection(orderType) {
  return orderType === 'album' ? 'album_orders' : 'frame_orders'
}

async function fetchStoreOrder(orderId, storeId, orderType) {
  const collection = resolveOrderCollection(orderType)
  let order = null
  try {
    const res = await db.collection(collection).doc(orderId).get()
    order = res.data
  } catch (e) {
    order = null
  }
  if (!order || order.storeId !== storeId) return null
  return { ...order, orderType: orderType === 'album' ? 'album' : 'frame' }
}

/**
 * 删除摆台订单：不退 balance；无其它订单引用时删除成片云文件并清理 photos/ai_tasks
 * 影集订单：仅删除订单记录，不删云相册图片
 */
async function deleteOrder(payload) {
  const orderId = String(payload.orderId || payload._id || '').trim()
  const storeId = requireStoreId(payload.storeId)
  if (!orderId) throw new Error('缺少 orderId')

  const orderType = payload.orderType === 'album' ? 'album' : 'frame'
  const order = await fetchStoreOrder(orderId, storeId, orderType)
  if (!order) throw new Error('订单不存在或不属于当前门店')

  if (orderType === 'album') {
    await db.collection('album_orders').doc(orderId).remove()
    return {
      orderId,
      orderNo: order.orderNo || '',
      orderType: 'album',
      deleted: true,
      deletedPortraitFiles: 0,
      clearedPhotos: 0,
      deletedTasks: 0,
      deletedExtraFiles: 0,
      skippedProtectedFiles: 0
    }
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
    orderType: 'frame',
    deleted: true,
    deletedPortraitFiles,
    clearedPhotos,
    deletedTasks,
    deletedExtraFiles,
    skippedProtectedFiles
  }
}

async function batchDeleteOrders(payload) {
  const storeId = requireStoreId(payload.storeId)
  const items = Array.isArray(payload.items) ? payload.items : []
  if (!items.length) throw new Error('请选择要删除的订单')

  const results = []
  for (const item of items) {
    const orderId = String(item.orderId || item._id || '').trim()
    if (!orderId) continue
    const orderType = item.orderType === 'album' ? 'album' : 'frame'
    try {
      const res = await deleteOrder({ orderId, storeId, orderType })
      results.push({ ...res, ok: true })
    } catch (err) {
      results.push({
        orderId,
        orderType,
        ok: false,
        error: err.message || '删除失败'
      })
    }
  }

  const success = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  if (!success.length && failed.length) {
    throw new Error(failed[0].error || '删除失败')
  }

  return {
    deletedCount: success.length,
    failed,
    results
  }
}

async function updateOrderShipping(payload) {
  const orderId = String(payload.orderId || payload._id || '').trim()
  const storeId = requireStoreId(payload.storeId)
  if (!orderId) throw new Error('缺少 orderId')

  const orderType = payload.orderType === 'album' ? 'album' : 'frame'
  const order = await fetchStoreOrder(orderId, storeId, orderType)
  if (!order) throw new Error('订单不存在或不属于当前门店')

  const shippingNo = payload.shippingNo != null ? String(payload.shippingNo).trim() : undefined
  if (shippingNo === undefined) throw new Error('缺少 shippingNo')

  const collection = resolveOrderCollection(orderType)
  const extra = {
    shippingNo,
    updateTime: db.serverDate()
  }
  if (payload.shippingCom !== undefined) extra.shippingCom = payload.shippingCom
  if (payload.shippingCompanyName !== undefined) {
    extra.shippingCompanyName = payload.shippingCompanyName
  }

  const shippingChanged =
    shippingNo !== String(order.shippingNo || '').trim() ||
    (payload.shippingCom !== undefined &&
      String(payload.shippingCom || '').trim() !== String(order.shippingCom || '').trim())

  if (shippingChanged) {
    extra.logisticsCache = _.remove()
  }

  await db.collection(collection).doc(orderId).update({ data: extra })
  const res = await db.collection(collection).doc(orderId).get()
  return res.data
}

module.exports = {
  deleteOrder,
  batchDeleteOrders,
  updateOrderShipping,
  fetchStoreOrder,
  resolveOrderCollection
}
