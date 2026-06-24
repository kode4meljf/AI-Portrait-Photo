const cloud = require('wx-server-sdk')

function isCloudFileId(fileId) {
  const id = String(fileId || '').trim()
  return id.startsWith('cloud://')
}

async function deleteCloudFileSafe(fileId) {
  const id = String(fileId || '').trim()
  if (!isCloudFileId(id)) return false
  try {
    await cloud.deleteFile({ fileList: [id] })
    return true
  } catch (err) {
    console.warn('[photoRetention/cloudFile] delete failed', id, err.message || err)
    return false
  }
}

module.exports = {
  isCloudFileId,
  deleteCloudFileSafe,
}
