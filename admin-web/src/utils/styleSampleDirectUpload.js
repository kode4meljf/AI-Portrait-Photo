import { adminRequest } from '../api/client'

export async function prepareStyleSampleUpload(kind, mimeType = 'image/jpeg') {
  return adminRequest('styles.prepareSampleUpload', { kind, mimeType })
}

export async function putStyleSampleBody(
  credential,
  body,
  { filename = 'sample.jpg', contentType = 'image/jpeg' } = {}
) {
  const form = new FormData()
  form.append('key', credential.cloudPath)
  form.append('Signature', credential.authorization)
  form.append('x-cos-security-token', credential.token)
  form.append('x-cos-meta-fileid', credential.cosFileId)
  form.append('file', body, filename)

  const res = await fetch(credential.uploadUrl, { method: 'POST', body: form })
  const text = await res.text().catch(() => '')
  if (!res.ok || (text && text.includes('<Error>'))) {
    throw new Error(`直传失败 HTTP ${res.status}: ${text.slice(0, 240)}`)
  }
  return credential.fileId
}

export async function uploadStyleSamplePair({
  thumbBody,
  hdBody,
  sampleHdFileId: existingHdFileId = '',
  mimeType = 'image/jpeg',
  thumbFilename = 'thumb.jpg',
  hdFilename = 'hd.jpg'
}) {
  if (!thumbBody && !hdBody && !existingHdFileId) throw new Error('缺少上传文件')

  let sampleFileId = ''
  let sampleHdFileId = String(existingHdFileId || '').trim()

  if (thumbBody) {
    const cred = await prepareStyleSampleUpload('thumb', mimeType)
    sampleFileId = await putStyleSampleBody(cred, thumbBody, {
      filename: thumbFilename,
      contentType: mimeType
    })
  }

  if (hdBody) {
    const cred = await prepareStyleSampleUpload('hd', mimeType)
    sampleHdFileId = await putStyleSampleBody(cred, hdBody, {
      filename: hdFilename,
      contentType: mimeType
    })
  }

  const payload = { mimeType }
  if (sampleFileId) payload.sampleFileId = sampleFileId
  if (sampleHdFileId) payload.sampleHdFileId = sampleHdFileId
  return adminRequest('styles.uploadSample', payload)
}
