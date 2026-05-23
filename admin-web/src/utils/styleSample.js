import { compressCanvasToJpegPayload } from './imagePayload'

/** 风格样图：竖版人像 3:4 */
export const STYLE_SAMPLE_RATIO = 3 / 4
export const STYLE_SAMPLE_WIDTH = 540
export const STYLE_SAMPLE_HEIGHT = 720
export const STYLE_SAMPLE_MAX_BYTES = 8 * 1024 * 1024
export const STYLE_SAMPLE_RATIO_TOLERANCE = 0.08

export const STYLE_SAMPLE_TIP =
  '请上传风格样图（3:4 竖图），支持 JPG/PNG/WebP；将自动裁剪并压缩后上传'

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

function cropCenterToRatio(img, ratio) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const srcRatio = srcW / srcH
  let cropW = srcW
  let cropH = srcH
  if (srcRatio > ratio) {
    cropW = Math.round(srcH * ratio)
  } else {
    cropH = Math.round(srcW / ratio)
  }
  const sx = Math.max(0, Math.floor((srcW - cropW) / 2))
  const sy = Math.max(0, Math.floor((srcH - cropH) / 2))
  return { sx, sy, cropW, cropH }
}

export async function processStyleSampleFile(file) {
  if (!file) throw new Error('请选择图片')
  if (file.size > STYLE_SAMPLE_MAX_BYTES) {
    throw new Error('图片不能超过 3MB')
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  if (file.type && !allowed.includes(file.type)) {
    throw new Error('仅支持 JPG、PNG、WebP')
  }

  const img = await loadImageFromFile(file)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  if (srcW < 270 || srcH < 360) {
    throw new Error('图片过小，短边建议不小于 360px')
  }

  const ratio = srcW / srcH
  const diff = Math.abs(ratio - STYLE_SAMPLE_RATIO) / STYLE_SAMPLE_RATIO
  const { sx, sy, cropW, cropH } = cropCenterToRatio(img, STYLE_SAMPLE_RATIO)

  const canvas = document.createElement('canvas')
  canvas.width = STYLE_SAMPLE_WIDTH
  canvas.height = STYLE_SAMPLE_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, STYLE_SAMPLE_WIDTH, STYLE_SAMPLE_HEIGHT)

  const packed = compressCanvasToJpegPayload(canvas)

  return {
    base64: packed.base64,
    previewUrl: packed.previewUrl,
    cropped: diff > STYLE_SAMPLE_RATIO_TOLERANCE
  }
}
