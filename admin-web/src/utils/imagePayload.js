/**
 * 经 HTTP 调用云函数时，JSON 文本 body 上限约 100KB（CloudBase EXCEED_MAX_PAYLOAD_SIZE）。
 * 缩略图直传 COS；base64 仅作兼容兜底。
 */
export const HTTP_SAFE_JPEG_MAX_BYTES = 320 * 1024

export function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || ''
  return Math.ceil((base64.length * 3) / 4)
}

/**
 * 将 canvas 导出为不超过 maxBytes 的 JPEG base64（自动降质量 / 缩小尺寸）
 */
export function compressCanvasToJpegPayload(canvas, maxBytes = HTTP_SAFE_JPEG_MAX_BYTES) {
  let quality = 0.85
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  let byteSize = estimateDataUrlBytes(dataUrl)

  while (byteSize > maxBytes && quality > 0.48) {
    quality -= 0.06
    dataUrl = canvas.toDataURL('image/jpeg', quality)
    byteSize = estimateDataUrlBytes(dataUrl)
  }

  if (byteSize > maxBytes) {
    const scaled = document.createElement('canvas')
    scaled.width = Math.max(1, Math.round(canvas.width * 0.75))
    scaled.height = Math.max(1, Math.round(canvas.height * 0.75))
    const ctx = scaled.getContext('2d')
    ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height)
    return compressCanvasToJpegPayload(scaled, maxBytes)
  }

  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
  return { base64, previewUrl: dataUrl, byteSize, quality }
}
