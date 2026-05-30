const cloud = require('wx-server-sdk');

function isCloudFileId(fileId) {
  const id = String(fileId || '').trim();
  return id.startsWith('cloud://');
}

async function deleteCloudFileSafe(fileId) {
  const id = String(fileId || '').trim();
  if (!isCloudFileId(id)) return;
  try {
    await cloud.deleteFile({ fileList: [id] });
  } catch (err) {
    console.warn('[jimengPortraitAi/cloudFile] deleteFile failed', id, err.message || err);
  }
}

async function deleteReplacedCloudFile(previousId, nextId) {
  const prev = String(previousId || '').trim();
  const next = String(nextId || '').trim();
  if (!prev || prev === next) return;
  await deleteCloudFileSafe(prev);
}

module.exports = {
  isCloudFileId,
  deleteCloudFileSafe,
  deleteReplacedCloudFile
};
