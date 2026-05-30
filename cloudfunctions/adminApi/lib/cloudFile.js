const cloud = require('wx-server-sdk')
const { db } = require('./db')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function isCloudFileId(fileId) {
  const id = String(fileId || '').trim()
  return id.startsWith('cloud://')
}

/** 风格样图 / 相框封面等平台资产仍被数据库引用时，禁止 deleteFile */
async function isPlatformManagedCloudFile(fileId) {
  const id = String(fileId || '').trim()
  if (!isCloudFileId(id)) return false

  const [styleCount, frameCount] = await Promise.all([
    db.collection('style_templates').where({ sampleFileId: id }).count(),
    db.collection('frame_templates').where({ coverFileId: id }).count()
  ])

  return (styleCount.total || 0) > 0 || (frameCount.total || 0) > 0
}

async function deleteCloudFileSafe(fileId) {
  const id = String(fileId || '').trim()
  if (!isCloudFileId(id)) return false
  if (await isPlatformManagedCloudFile(id)) {
    console.warn('[cloudFile] skip delete, platform asset still referenced', id)
    return false
  }
  try {
    await cloud.deleteFile({ fileList: [id] })
    return true
  } catch (err) {
    console.warn('[cloudFile] deleteFile failed', id, err.message || err)
    return false
  }
}

async function deleteCloudFilesSafe(fileIds) {
  const list = [
    ...new Set((fileIds || []).map((id) => String(id || '').trim()).filter(isCloudFileId))
  ]
  if (!list.length) return { deleted: 0, skipped: 0 }

  let deleted = 0
  let skipped = 0
  for (const id of list) {
    const ok = await deleteCloudFileSafe(id)
    if (ok) deleted += 1
    else skipped += 1
  }
  return { deleted, skipped }
}

/** 新 fileID 已落库后，删除被替换的旧云文件（prev !== next） */
async function deleteReplacedCloudFile(previousId, nextId) {
  const prev = String(previousId || '').trim()
  const next = String(nextId || '').trim()
  if (!prev || prev === next) return
  await deleteCloudFileSafe(prev)
}

module.exports = {
  isCloudFileId,
  isPlatformManagedCloudFile,
  deleteCloudFileSafe,
  deleteCloudFilesSafe,
  deleteReplacedCloudFile
}
