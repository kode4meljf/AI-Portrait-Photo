const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const QRCode = require('qrcode')
const { buildCheckinQrPayload } = require('./qrPayload')
const { deleteCloudFileSafe } = require('./cloudFile')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function hashPayload(payload) {
  return crypto.createHash('sha256').update(payload || '', 'utf8').digest('hex')
}

async function uploadCheckinQrPng(customerDocId, buffer) {
  const cloudPath = `customer-checkin-qr/${customerDocId}.png`
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  })
  return upload.fileID
}

/**
 * 确保打卡二维码云文件与当前 payload 一致；不一致则重生成并更新库
 * @returns {Promise<object>} 含 checkinQrFileId / checkinQrPayloadHash 的顾客行字段
 */
async function ensureCheckinQr(row, options = {}) {
  const customerDocId = (row && row._id) || ''
  if (!customerDocId) throw new Error('缺少客户 ID')

  const payloadRow =
    options.openId && !(row.wxOpenId || '').trim()
      ? { ...row, wxOpenId: options.openId }
      : row
  const payload = buildCheckinQrPayload(payloadRow)
  const now = Date.now()

  if (!payload) {
    const oldFileId = (row.checkinQrFileId || '').trim()
    if (oldFileId) await deleteCloudFileSafe(oldFileId)
    await db.collection('customers').doc(customerDocId).update({
      data: {
        checkinQrFileId: '',
        checkinQrPayloadHash: '',
        updateTime: now
      }
    })
    return {
      ...row,
      checkinQrFileId: '',
      checkinQrPayloadHash: ''
    }
  }

  const payloadHash = hashPayload(payload)
  const existingFileId = (row.checkinQrFileId || '').trim()
  const existingHash = (row.checkinQrPayloadHash || '').trim()

  if (existingFileId && existingHash === payloadHash) {
    return {
      ...row,
      checkinQrFileId: existingFileId,
      checkinQrPayloadHash: payloadHash
    }
  }

  const buffer = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 420,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1a2e', light: '#ffffff' }
  })

  if (existingFileId) {
    await deleteCloudFileSafe(existingFileId)
  }

  const fileID = await uploadCheckinQrPng(customerDocId, buffer)

  await db.collection('customers').doc(customerDocId).update({
    data: {
      checkinQrFileId: fileID,
      checkinQrPayloadHash: payloadHash,
      updateTime: now
    }
  })

  return {
    ...row,
    checkinQrFileId: fileID,
    checkinQrPayloadHash: payloadHash
  }
}

/** @deprecated 请用 ensureCheckinQr；保留 action 兼容 */
async function checkinQrImage(row, options = {}) {
  const updated = await ensureCheckinQr(row, options)
  const fileID = (updated.checkinQrFileId || '').trim()
  if (!fileID) {
    throw new Error('请先授权手机号后再生成打卡码')
  }
  return { fileID }
}

module.exports = {
  ensureCheckinQr,
  checkinQrImage,
  hashPayload
}
