/**
 * 风格样图 COS 直传（prepare → POST 二进制 → register fileId）
 * 供命令行脚本使用，绕过 HTTP JSON 100KB 限制。
 */

async function putStyleSampleBody(
  credential,
  body,
  { filename = 'sample.jpg', contentType = 'image/jpeg' } = {}
) {
  const form = new FormData()
  form.append('key', credential.cloudPath)
  form.append('Signature', credential.authorization)
  form.append('x-cos-security-token', credential.token)
  form.append('x-cos-meta-fileid', credential.cosFileId)
  const blob =
    body instanceof Blob ? body : new Blob([body], { type: contentType })
  form.append('file', blob, filename)

  const res = await fetch(credential.uploadUrl, { method: 'POST', body: form })
  const text = await res.text().catch(() => '')
  if (!res.ok || (text && text.includes('<Error>'))) {
    throw new Error(`直传失败 HTTP ${res.status}: ${text.slice(0, 240)}`)
  }
  return credential.fileId
}

async function prepareStyleSampleUpload(postAdmin, api, token, kind, mimeType = 'image/jpeg') {
  return postAdmin(
    api,
    { action: 'styles.prepareSampleUpload', kind, mimeType },
    token
  )
}

async function registerStyleSampleFileIds(
  postAdmin,
  api,
  token,
  { sampleFileId, sampleHdFileId, mimeType = 'image/jpeg' }
) {
  const payload = { action: 'styles.uploadSample', mimeType }
  if (sampleFileId) payload.sampleFileId = sampleFileId
  if (sampleHdFileId) payload.sampleHdFileId = sampleHdFileId
  return postAdmin(api, payload, token)
}

/**
 * @param {Function} postAdmin - (api, body, token) => Promise
 */
async function uploadStyleSampleDirect(
  postAdmin,
  api,
  token,
  { thumbBody, hdBody, mimeType = 'image/jpeg', thumbFilename, hdFilename } = {}
) {
  if (!thumbBody && !hdBody) throw new Error('缺少上传文件')

  let sampleFileId = ''
  let sampleHdFileId = ''

  if (thumbBody) {
    const cred = await prepareStyleSampleUpload(postAdmin, api, token, 'thumb', mimeType)
    sampleFileId = await putStyleSampleBody(cred, thumbBody, {
      filename: thumbFilename || 'thumb.jpg',
      contentType: mimeType
    })
  }

  if (hdBody) {
    const cred = await prepareStyleSampleUpload(postAdmin, api, token, 'hd', mimeType)
    sampleHdFileId = await putStyleSampleBody(cred, hdBody, {
      filename: hdFilename || 'hd.jpg',
      contentType: mimeType
    })
  }

  return registerStyleSampleFileIds(postAdmin, api, token, {
    sampleFileId: sampleFileId || undefined,
    sampleHdFileId: sampleHdFileId || undefined,
    mimeType
  })
}

module.exports = {
  putStyleSampleBody,
  prepareStyleSampleUpload,
  registerStyleSampleFileIds,
  uploadStyleSampleDirect
}
