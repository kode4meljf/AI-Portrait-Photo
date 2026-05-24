const cloud = require('wx-server-sdk')

function isCloudFileId(fileId) {
  const id = String(fileId || '').trim()
  return id.startsWith('cloud://')
}

async function deleteCloudFileSafe(fileId) {
  const id = String(fileId || '').trim()
  if (!isCloudFileId(id)) return
  try {
    await cloud.deleteFile({ fileList: [id] })
  } catch (err) {
    console.warn('[cloudFile] deleteFile failed', id, err.message || err)
  }
}

async function deleteCloudFilesSafe(fileIds) {
  const list = [
    ...new Set((fileIds || []).map((id) => String(id || '').trim()).filter(isCloudFileId))
  ]
  if (!list.length) return
  try {
    await cloud.deleteFile({ fileList: list })
  } catch (err) {
    console.warn('[cloudFile] deleteFile batch failed', err.message || err)
    for (const id of list) {
      await deleteCloudFileSafe(id)
    }
  }
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
  deleteCloudFileSafe,
  deleteCloudFilesSafe,
  deleteReplacedCloudFile
}
