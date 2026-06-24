import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { api } from '@/api/admin'

const FRAME_HEADERS = [
  '订单号',
  '相框编号',
  '相框名称',
  '材质',
  '尺寸',
  '客户姓名',
  '客户手机',
  '图片文件名'
]

const ALBUM_HEADERS = ['订单号', '客户姓名', '客户手机', '照片数量', '文件夹名']

function sheetFromRows(headers, rows, rowMapper) {
  const data = [headers, ...rows.map(rowMapper)]
  const ws = XLSX.utils.aoa_to_sheet(data)
  return ws
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType || 'image/jpeg' })
}

async function fetchBlobFromUrl(url) {
  if (!url) throw new Error('缺少图片下载地址')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`图片下载失败 (${res.status})`)
  return res.blob()
}

async function fetchExportImageBlob(file) {
  const cloudFileId = String(file.cloudFileId || '').trim()
  if (cloudFileId.startsWith('cloud://')) {
    const res = await api.fetchOrderExportImage({ cloudFileId })
    return base64ToBlob(res.base64, res.mimeType)
  }
  const url = String(file.downloadUrl || '').trim()
  if (url) return fetchBlobFromUrl(url)
  throw new Error(`缺少图片文件：${file.fileName || 'unknown'}`)
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

function buildZipFileName(exportData) {
  const frame = exportData.frame || { rows: [] }
  const album = exportData.album || { rows: [] }
  const hasFrame = frame.rows.length > 0
  const hasAlbum = album.rows.length > 0
  let typeLabel = '影集&摆台'
  if (hasFrame && !hasAlbum) typeLabel = '摆台'
  else if (hasAlbum && !hasFrame) typeLabel = '影集'

  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `银梦_${typeLabel}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.zip`
}

export async function buildOrdersExportZip(exportData) {
  const zip = new JSZip()
  const frame = exportData.frame || { rows: [], images: [] }
  const album = exportData.album || { rows: [], folders: [] }

  if (frame.rows.length) {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromRows(FRAME_HEADERS, frame.rows, (row) => [
        row.orderNo,
        row.frameCode,
        row.frameName,
        row.material,
        row.size,
        row.customerName,
        row.customerPhone,
        row.imageFileName
      ]),
      '摆台订单'
    )
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    zip.file('摆台/摆台订单.xlsx', excelBuffer)

    const imagesFolder = zip.folder('摆台/images')
    for (const image of frame.images) {
      const blob = await fetchExportImageBlob(image)
      imagesFolder.file(image.fileName, blob)
    }
  }

  if (album.rows.length) {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromRows(ALBUM_HEADERS, album.rows, (row) => [
        row.orderNo,
        row.customerName,
        row.customerPhone,
        row.photoCount,
        row.folderName
      ]),
      '影集订单'
    )
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    zip.file('影集/影集订单.xlsx', excelBuffer)

    for (const folder of album.folders) {
      const zipFolder = zip.folder(`影集/${folder.folderName}`)
      const files = folder.files || []
      if (!files.length) {
        throw new Error(`影集订单 ${folder.folderName} 没有照片文件`)
      }
      for (const file of files) {
        const blob = await fetchExportImageBlob(file)
        zipFolder.file(file.fileName, blob)
      }
    }
  }

  if (!frame.rows.length && !album.rows.length) {
    throw new Error('没有可导出的订单数据')
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, buildZipFileName(exportData))
}

export const EXPORTABLE_STATUSES = ['待处理', '制作中']
