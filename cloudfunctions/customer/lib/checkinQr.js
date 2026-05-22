const cloud = require('wx-server-sdk')
const QRCode = require('qrcode')
const { buildCheckinQrPayload } = require('./qrPayload')

async function checkinQrImage(row) {
  const payload = buildCheckinQrPayload(row)
  if (!payload) {
    throw new Error('请先授权手机号后再生成打卡码')
  }

  const buffer = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 420,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1a2e', light: '#ffffff' }
  })

  const cloudPath = `customer-checkin-qr/${row._id}_${Date.now()}.png`
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  })
  const urlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] })
  const item = urlRes.fileList && urlRes.fileList[0]
  return {
    fileID: upload.fileID,
    tempFileURL: (item && item.tempFileURL) || ''
  }
}

module.exports = { checkinQrImage }
