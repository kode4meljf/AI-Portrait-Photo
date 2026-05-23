const cloud = require('wx-server-sdk')
const fs = require('fs')
const os = require('os')
const path = require('path')

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
  const cloudIds = list
    .map((row) => row.sampleFileId)
    .filter((id) => id && String(id).startsWith('cloud://'))
  if (!cloudIds.length) {
    return list.map((row) => {
      const sampleFileId = row.sampleFileId || ''
      return {
        ...row,
        sampleFileId,
        sampleUrl:
          sampleFileId && !String(sampleFileId).startsWith('cloud://') ? sampleFileId : ''
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
      const sampleFileId = row.sampleFileId || ''
      return {
        ...row,
        sampleFileId,
        sampleUrl:
          map[sampleFileId] ||
          (sampleFileId && !String(sampleFileId).startsWith('cloud://') ? sampleFileId : '')
      }
    })
  } catch (e) {
    return list.map((row) => {
      const sampleFileId = row.sampleFileId || ''
      return { ...row, sampleFileId, sampleUrl: sampleFileId || '' }
    })
  }
}

const HTTP_UPLOAD_MAX_BYTES = 400 * 1024

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

module.exports = {
  uploadFrameCoverFromBase64,
  attachFrameCoverUrls,
  uploadStyleSampleFromBase64,
  attachStyleSampleUrls,
  attachCustomerAvatarUrls,
  uploadCustomerAvatarFromBase64,
  getDisplayUrl
}
