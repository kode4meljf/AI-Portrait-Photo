const { cloud, db, _ } = require('./db')
const { getCustomerDisplayName } = require('./customerFormat')

const EXPORTABLE_STATUSES = ['待处理', '制作中']
const EXPORT_IMAGE_MAX_BYTES = 15 * 1024 * 1024

function requireStoreId(storeId) {
  const id = String(storeId || '').trim()
  if (!id || !/^store_/i.test(id)) throw new Error('请先在后台选择门店')
  return id
}

function buildFrameSizeText(row) {
  if (!row) return ''
  if (row.sizeFirst != null && row.sizeSecond != null) {
    const u = row.sizeUnit || 'cm'
    return `${row.sizeFirst}${u} × ${row.sizeSecond}${u}`
  }
  return String(row.size || '').trim()
}

function maskPhone(phone) {
  const p = String(phone || '')
    .trim()
    .replace(/\s/g, '')
  if (!p) return '-'
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(-4)}`
  if (p.length >= 7) return `${p.slice(0, 2)}****${p.slice(-2)}`
  return '****'
}

function sanitizeName(value) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || 'unknown'
}

function extFromRef(ref) {
  const m = String(ref || '').match(/\.(jpe?g|png|webp|gif)(\?|$)/i)
  if (!m) return 'jpg'
  const ext = m[1].toLowerCase()
  return ext === 'jpeg' ? 'jpg' : ext
}

function isCloudFileId(ref) {
  return String(ref || '').trim().startsWith('cloud://')
}

async function loadPhotoRefMap(photoIds) {
  const ids = [...new Set((photoIds || []).filter(Boolean))]
  const map = {}
  if (!ids.length) return map
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20)
    const res = await db.collection('photos').where({ _id: _.in(chunk) }).get()
    ;(res.data || []).forEach((p) => {
      const ref = String(p.aiUrl || p.originalUrl || '').trim()
      if (ref) map[p._id] = ref
    })
  }
  return map
}

function resolveAlbumPhotoRefs(order, photoRefById) {
  const urls = Array.isArray(order.photoUrls) ? order.photoUrls.filter(Boolean) : []
  if (urls.length) return urls
  const ids = Array.isArray(order.photoIds) ? order.photoIds.filter(Boolean) : []
  return ids.map((id) => photoRefById[id] || '').filter(Boolean)
}

function toExportImageFile(ref, fileName, tempMap) {
  const raw = String(ref || '').trim()
  return {
    fileName,
    downloadUrl: pickDownloadUrl(raw, tempMap),
    cloudFileId: isCloudFileId(raw) ? raw : ''
  }
}

async function loadCustomerMap(customerIds) {
  const ids = [...new Set((customerIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const res = await db.collection('customers').where({ _id: _.in(ids) }).get()
  const map = {}
  ;(res.data || []).forEach((c) => {
    map[c._id] = c
  })
  return map
}

async function loadFrameTemplateMap(templateIds) {
  const ids = [...new Set((templateIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const res = await db.collection('frame_templates').where({ id: _.in(ids) }).get()
  const map = {}
  ;(res.data || []).forEach((t) => {
    map[t.id] = t
  })
  return map
}

async function resolveTempUrls(fileIds) {
  const cloudIds = [...new Set((fileIds || []).filter((id) => id && String(id).startsWith('cloud://')))]
  const map = {}
  if (!cloudIds.length) return map
  const CHUNK = 50
  for (let i = 0; i < cloudIds.length; i += CHUNK) {
    const chunk = cloudIds.slice(i, i + CHUNK)
    try {
      const res = await cloud.getTempFileURL({ fileList: chunk })
      ;(res.fileList || []).forEach((item) => {
        if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL
      })
    } catch (err) {
      console.warn('[orderExport] getTempFileURL', err.message || err)
    }
  }
  return map
}

function pickDownloadUrl(ref, tempMap) {
  const raw = String(ref || '').trim()
  if (!raw) return ''
  if (raw.startsWith('cloud://')) return tempMap[raw] || ''
  return raw
}

async function markOrdersExported(orders) {
  for (const order of orders) {
    const coll = order.orderType === 'album' ? 'album_orders' : 'frame_orders'
    const data = {
      exportedAt: db.serverDate(),
      updateTime: db.serverDate()
    }
    if (order.status === '待处理') data.status = '制作中'
    await db.collection(coll).doc(order._id).update({ data })
  }
}

async function fetchOrderByType(orderId, orderType, storeId) {
  const coll = orderType === 'album' ? 'album_orders' : 'frame_orders'
  const res = await db.collection(coll).doc(orderId).get()
  const order = res.data
  if (!order || order.storeId !== storeId) return null
  return { ...order, orderType }
}

/**
 * 准备导出数据；导出后将 待处理→制作中，并写入 exportedAt
 */
async function prepareOrderExport(payload) {
  const storeId = requireStoreId(payload.storeId)
  const items = Array.isArray(payload.items) ? payload.items : []
  if (!items.length) throw new Error('请选择要导出的订单')

  const fetched = []
  for (const item of items) {
    const orderId = String(item.orderId || item._id || '').trim()
    const orderType = item.orderType === 'album' ? 'album' : 'frame'
    if (!orderId) continue
    const order = await fetchOrderByType(orderId, orderType, storeId)
    if (order) fetched.push(order)
  }
  if (!fetched.length) throw new Error('未找到可导出的订单')

  const exportable = fetched.filter((o) => EXPORTABLE_STATUSES.includes(o.status))
  const skipped = fetched
    .filter((o) => !EXPORTABLE_STATUSES.includes(o.status))
    .map((o) => ({ orderId: o._id, orderNo: o.orderNo || '', reason: '状态不可导出' }))

  if (!exportable.length) {
    throw new Error('所选订单均不可导出（仅支持待处理、制作中）')
  }

  const customerMap = await loadCustomerMap(exportable.map((o) => o.customerId))
  const frameTemplateMap = await loadFrameTemplateMap(
    exportable.filter((o) => o.orderType === 'frame').map((o) => o.frameTemplateId)
  )
  const albumOrders = exportable.filter((o) => o.orderType === 'album')
  const photoRefById = await loadPhotoRefMap(
    albumOrders.flatMap((o) => (Array.isArray(o.photoIds) ? o.photoIds : []))
  )

  const cloudIds = []
  exportable.forEach((order) => {
    if (order.orderType === 'frame') {
      const id = String(order.photoUrl || '').trim()
      if (isCloudFileId(id)) cloudIds.push(id)
    } else {
      resolveAlbumPhotoRefs(order, photoRefById).forEach((url) => {
        const id = String(url || '').trim()
        if (isCloudFileId(id)) cloudIds.push(id)
      })
    }
  })
  const tempMap = await resolveTempUrls(cloudIds)

  const frameRows = []
  const frameImages = []
  const albumRows = []
  const albumFolders = []

  exportable.forEach((order) => {
    const customer = order.customerId ? customerMap[order.customerId] : null
    const customerName = customer ? getCustomerDisplayName(customer) : '-'
    const customerPhone = maskPhone(customer?.phone)

    if (order.orderType === 'album') {
      const folderName = sanitizeName(`${order.orderNo || order._id}_${customerName}`)
      const refs = resolveAlbumPhotoRefs(order, photoRefById)
      if (!refs.length) {
        throw new Error(`影集订单 ${order.orderNo || order._id} 缺少照片，无法导出`)
      }
      const files = refs.map((ref, index) =>
        toExportImageFile(
          ref,
          `${String(index + 1).padStart(2, '0')}.${extFromRef(ref)}`,
          tempMap
        )
      )
      albumFolders.push({ folderName, files })
      albumRows.push({
        orderNo: order.orderNo || '',
        customerName,
        customerPhone,
        photoCount: files.length,
        folderName
      })
      return
    }

    const template = frameTemplateMap[order.frameTemplateId] || null
    const frameCode = template?.id || order.frameTemplateId || '-'
    const frameName = template?.name || order.frameName || '-'
    const material = template?.material || '-'
    const size = buildFrameSizeText(template) || '-'
    const imageFileName = `${sanitizeName(order.orderNo || order._id)}.${extFromRef(order.photoUrl)}`

    frameRows.push({
      orderNo: order.orderNo || '',
      frameCode,
      frameName,
      material,
      size,
      customerName,
      customerPhone,
      imageFileName
    })
    frameImages.push(
      toExportImageFile(order.photoUrl, imageFileName, tempMap)
    )
  })

  await markOrdersExported(exportable)

  return {
    exportedCount: exportable.length,
    skipped,
    frame: { rows: frameRows, images: frameImages },
    album: { rows: albumRows, folders: albumFolders }
  }
}

/** 云函数内下载 cloud:// 成片，供后台导出 zip（绕过浏览器 CORS） */
async function fetchOrderExportImage(payload) {
  const fileId = String(payload.cloudFileId || payload.fileId || '').trim()
  if (!isCloudFileId(fileId)) throw new Error('无效的云文件 ID')
  const res = await cloud.downloadFile({ fileID: fileId })
  const buffer = res.fileContent
  if (!buffer || !buffer.length) throw new Error('云文件为空或无法读取')
  if (buffer.length > EXPORT_IMAGE_MAX_BYTES) {
    throw new Error('图片过大，无法导出')
  }
  const lower = fileId.toLowerCase()
  let mimeType = 'image/jpeg'
  if (lower.endsWith('.png')) mimeType = 'image/png'
  else if (lower.endsWith('.webp')) mimeType = 'image/webp'
  else if (lower.endsWith('.gif')) mimeType = 'image/gif'
  return {
    base64: buffer.toString('base64'),
    mimeType,
    byteSize: buffer.length
  }
}

module.exports = {
  EXPORTABLE_STATUSES,
  prepareOrderExport,
  fetchOrderExportImage
}
