/**
 * 客户端云存储清理（上传成功但后续写库失败时回滚）
 */
async function deleteCloudFileSafe(fileID) {
  const id = String(fileID || '').trim()
  if (!id.startsWith('cloud://')) return
  try {
    await wx.cloud.deleteFile({ fileList: [id] })
  } catch (err) {
    console.warn('[cloudFileCleanup] delete failed', id, err)
  }
}

module.exports = {
  deleteCloudFileSafe
}
