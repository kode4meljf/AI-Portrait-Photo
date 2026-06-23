const cloud = require('wx-server-sdk')
const fs = require('fs')
const os = require('os')
const path = require('path')

let _tcbApp = null
let _tcbSdk = null

function loadTcbSdk() {
  if (_tcbSdk) return _tcbSdk
  try {
    _tcbSdk = require('@cloudbase/node-sdk')
  } catch {
    const wxRoot = path.dirname(require.resolve('wx-server-sdk'))
    _tcbSdk = require(path.join(wxRoot, 'node_modules', '@cloudbase/node-sdk'))
  }
  return _tcbSdk
}

function getTcbApp() {
  if (!_tcbApp) {
    const tcb = loadTcbSdk()
    _tcbApp = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
  }
  return _tcbApp
}

function buildStyleSampleCloudPath(kind, mimeType = 'image/jpeg') {
  const ext = String(mimeType).includes('png') ? 'png' : 'jpg'
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  if (kind === 'hd') {
    return `admin/style-templates/hd/${ts}_${rand}.${ext}`
  }
  return `admin/style-templates/${ts}_${rand}.${ext}`
}

function assertValidStyleSampleFileId(fileId, kind) {
  const id = String(fileId || '').trim()
  if (!id.startsWith('cloud://')) throw new Error('无效的云文件 ID')
  if (kind === 'hd') {
    if (!id.includes('/admin/style-templates/hd/')) throw new Error('高清样图路径无效')
  } else if (!id.includes('/admin/style-templates/') || id.includes('/admin/style-templates/hd/')) {
    throw new Error('缩略样图路径无效')
  }
  return id
}

/** 签发风格样图 COS 直传凭证（客户端 PUT/POST 二进制，不经 JSON base64） */
async function prepareStyleSampleDirectUpload({ kind = 'thumb', mimeType = 'image/jpeg' } = {}) {
  const normalizedKind = kind === 'hd' ? 'hd' : 'thumb'
  const cloudPath = buildStyleSampleCloudPath(normalizedKind, mimeType)
  const res = await getTcbApp().getUploadMetadata({ cloudPath })
  if (res.code) {
    throw new Error(res.message || res.code || '获取上传凭证失败')
  }
  const data = res.data || {}
  const { url, token, authorization, fileId, cosFileId } = data
  if (!url || !fileId || !authorization || !token || !cosFileId) {
    throw new Error('上传凭证不完整')
  }
  return {
    kind: normalizedKind,
    cloudPath,
    uploadUrl: url,
    authorization,
    token,
    cosFileId,
    fileId
  }
}

async function uploadBuffer(buffer, cloudPath) {
  try {
    const res = await cloud.uploadFile({ cloudPath, fileContent: buffer })
    return res.fileID
  } catch (err) {
    const tmpFile = path.join(
      os.tmpdir(),
      `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
    )
    fs.writeFileSync(tmpFile, buffer)
    try {
      const res = await cloud.uploadFile({ cloudPath, filePath: tmpFile })
      return res.fileID
    } finally {
      try {
        fs.unlinkSync(tmpFile)
      } catch (e) {
        /* ignore */
      }
    }
  }
}

async function getDisplayUrl(fileID) {
  if (!fileID || !String(fileID).startsWith('cloud://')) {
    return fileID || ''
  }
  try {
    const res = await cloud.getTempFileURL({ fileList: [fileID] })
    const item = res.fileList && res.fileList[0]
    return (item && item.tempFileURL) || fileID
  } catch (e) {
    return fileID
  }
}

/** 仅后台浏览器展示用：cloud:// → 临时 HTTPS */
async function attachFrameCoverUrls(rows) {
  const list = rows || []
  const cloudIds = list
    .map((row) => row.coverFileId)
    .filter((id) => id && String(id).startsWith('cloud://'))
  if (!cloudIds.length) {
    return list.map((row) => {
      const coverFileId = row.coverFileId || ''
      return {
        ...row,
        coverFileId,
        coverUrl: coverFileId && !String(coverFileId).startsWith('cloud://') ? coverFileId : ''
      }
    })
  }
  try {
    const res = await cloud.getTempFileURL({ fileList: [...new Set(cloudIds)] })
    const map = {}
    ;(res.fileList || []).forEach((item) => {
      if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL
    })
    return list.map((row) => {
      const coverFileId = row.coverFileId || ''
      return {
        ...row,
        coverFileId,
        coverUrl: map[coverFileId] || (coverFileId && !String(coverFileId).startsWith('cloud://') ? coverFileId : '')
      }
    })
  } catch (e) {
    return list.map((row) => {
      const coverFileId = row.coverFileId || ''
      return { ...row, coverFileId, coverUrl: coverFileId || '' }
    })
  }
}

async function attachStyleSampleUrls(rows) {
  const list = rows || []
  const cloudIds = []
  list.forEach((row) => {
    if (row.sampleFileId && String(row.sampleFileId).startsWith('cloud://')) {
      cloudIds.push(row.sampleFileId)
    }
    if (row.sampleHdFileId && String(row.sampleHdFileId).startsWith('cloud://')) {
      cloudIds.push(row.sampleHdFileId)
    }
  })
  if (!cloudIds.length) {
    return list.map((row) => {
      const sampleFileId = row.sampleFileId || ''
      const sampleHdFileId = row.sampleHdFileId || ''
      return {
        ...row,
        sampleFileId,
        sampleUrl:
          sampleFileId && !String(sampleFileId).startsWith('cloud://') ? sampleFileId : '',
        sampleHdFileId,
        sampleHdUrl:
          sampleHdFileId && !String(sampleHdFileId).startsWith('cloud://') ? sampleHdFileId : ''
      }
    })
  }
  try {
    const unique = [...new Set(cloudIds)]
    const map = {}
    const CHUNK = 50
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK)
      const res = await cloud.getTempFileURL({ fileList: chunk })
      ;(res.fileList || []).forEach((item) => {
        if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL
      })
    }
    return list.map((row) => {
      const sampleFileId = row.sampleFileId || ''
      const sampleHdFileId = row.sampleHdFileId || ''
      return {
        ...row,
        sampleFileId,
        sampleUrl:
          map[sampleFileId] ||
          (sampleFileId && !String(sampleFileId).startsWith('cloud://') ? sampleFileId : ''),
        sampleHdFileId,
        sampleHdUrl:
          map[sampleHdFileId] ||
          (sampleHdFileId && !String(sampleHdFileId).startsWith('cloud://') ? sampleHdFileId : '')
      }
    })
  } catch (e) {
    return list.map((row) => {
      const sampleFileId = row.sampleFileId || ''
      const sampleHdFileId = row.sampleHdFileId || ''
      return {
        ...row,
        sampleFileId,
        sampleUrl: sampleFileId || '',
        sampleHdFileId,
        sampleHdUrl: sampleHdFileId || ''
      }
    })
  }
}

const HTTP_UPLOAD_MAX_BYTES = 5 * 1024 * 1024

async function uploadStyleSampleFromBase64(base64, mimeType = 'image/jpeg') {
  const raw = String(base64 || '').replace(/^data:image\/\w+;base64,/, '').trim()
  if (!raw) throw new Error('缺少图片数据')

  const buffer = Buffer.from(raw, 'base64')
  if (!buffer.length) throw new Error('图片数据无效')
  if (buffer.length > HTTP_UPLOAD_MAX_BYTES) {
    throw new Error('图片仍过大，请刷新页面后重试（前端将自动更强压缩）')
  }

  const ext = mimeType.includes('png') ? 'png' : 'jpg'
  const cloudPath = `admin/style-templates/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const sampleFileId = await uploadBuffer(buffer, cloudPath)
  const sampleUrl = await getDisplayUrl(sampleFileId)
  return { sampleFileId, sampleUrl }
}

async function uploadStyleHdSampleFromBase64(base64, mimeType = 'image/jpeg') {
  const raw = String(base64 || '').replace(/^data:image\/\w+;base64,/, '').trim()
  if (!raw) throw new Error('缺少高清图片数据')

  const buffer = Buffer.from(raw, 'base64')
  if (!buffer.length) throw new Error('高清图片数据无效')
  if (buffer.length > HTTP_UPLOAD_MAX_BYTES) {
    throw new Error('高清图片仍过大，请刷新页面后重试（前端将自动更强压缩）')
  }

  const ext = mimeType.includes('png') ? 'png' : 'jpg'
  const cloudPath = `admin/style-templates/hd/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const sampleHdFileId = await uploadBuffer(buffer, cloudPath)
  const sampleHdUrl = await getDisplayUrl(sampleHdFileId)
  return { sampleHdFileId, sampleHdUrl }
}

async function uploadFrameCoverFromBase64(base64, mimeType = 'image/jpeg') {
  const raw = String(base64 || '').replace(/^data:image\/\w+;base64,/, '').trim()
  if (!raw) throw new Error('缺少图片数据')

  const buffer = Buffer.from(raw, 'base64')
  if (!buffer.length) throw new Error('图片数据无效')
  if (buffer.length > HTTP_UPLOAD_MAX_BYTES) {
    throw new Error('图片仍过大，请刷新页面后重试（前端将自动更强压缩）')
  }

  const ext = mimeType.includes('png') ? 'png' : 'jpg'
  const cloudPath = `admin/frame-templates/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const coverFileId = await uploadBuffer(buffer, cloudPath)
  const coverUrl = await getDisplayUrl(coverFileId)
  return { coverFileId, coverUrl }
}

/** 客户头像 cloud:// → 临时 HTTPS，供后台列表展示 */
async function attachCustomerAvatarUrls(rows) {
  const list = rows || []
  const cloudIds = list
    .map((row) => row.avatarUrl)
    .filter((id) => id && String(id).startsWith('cloud://'))
  if (!cloudIds.length) {
    return list.map((row) => {
      const avatarUrl = row.avatarUrl || ''
      return {
        ...row,
        avatarUrl,
        avatarDisplayUrl:
          avatarUrl && !String(avatarUrl).startsWith('cloud://') ? avatarUrl : ''
      }
    })
  }
  try {
    const res = await cloud.getTempFileURL({ fileList: [...new Set(cloudIds)] })
    const map = {}
    ;(res.fileList || []).forEach((item) => {
      if (item.fileID && item.tempFileURL) map[item.fileID] = item.tempFileURL
    })
    return list.map((row) => {
      const avatarUrl = row.avatarUrl || ''
      return {
        ...row,
        avatarUrl,
        avatarDisplayUrl:
          map[avatarUrl] ||
          (avatarUrl && !String(avatarUrl).startsWith('cloud://') ? avatarUrl : '')
      }
    })
  } catch (e) {
    return list.map((row) => {
      const avatarUrl = row.avatarUrl || ''
      return { ...row, avatarUrl, avatarDisplayUrl: avatarUrl || '' }
    })
  }
}

async function uploadCustomerAvatarFromBase64(customerId, base64, mimeType = 'image/jpeg') {
  const id = String(customerId || '').trim()
  if (!id) throw new Error('缺少客户 id')

  const raw = String(base64 || '').replace(/^data:image\/\w+;base64,/, '').trim()
  if (!raw) throw new Error('缺少图片数据')

  const buffer = Buffer.from(raw, 'base64')
  if (!buffer.length) throw new Error('图片数据无效')
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error('头像不能超过 2MB')
  }

  const ext = mimeType.includes('png') ? 'png' : 'jpg'
  const cloudPath = `admin/customer-avatars/${id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
  const avatarUrl = await uploadBuffer(buffer, cloudPath)
  const avatarDisplayUrl = await getDisplayUrl(avatarUrl)
  return { avatarUrl, avatarDisplayUrl }
}

const CLOUD_SAMPLE_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** 云函数内下载 cloud:// 样图，供后台裁剪（绕过浏览器 CORS） */
async function downloadCloudFileAsBase64(fileID) {
  const id = String(fileID || '').trim()
  if (!id.startsWith('cloud://')) throw new Error('无效的云文件 ID')
  const res = await cloud.downloadFile({ fileID: id })
  const buffer = res.fileContent
  if (!buffer || !buffer.length) throw new Error('云文件为空或无法读取')
  if (buffer.length > CLOUD_SAMPLE_IMAGE_MAX_BYTES) {
    throw new Error('图片过大，请使用压缩后的样图')
  }
  const lower = id.toLowerCase()
  const mimeType = lower.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return {
    base64: buffer.toString('base64'),
    mimeType,
    byteSize: buffer.length
  }
}

module.exports = {
  uploadFrameCoverFromBase64,
  attachFrameCoverUrls,
  uploadStyleSampleFromBase64,
  uploadStyleHdSampleFromBase64,
  prepareStyleSampleDirectUpload,
  assertValidStyleSampleFileId,
  attachStyleSampleUrls,
  attachCustomerAvatarUrls,
  uploadCustomerAvatarFromBase64,
  getDisplayUrl,
  downloadCloudFileAsBase64
}
