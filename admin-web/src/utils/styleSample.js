import { compressCanvasToJpegPayload } from './imagePayload'

/** 单次 HTTP 请求内高清图体积上限（CloudBase body 约 1MB，缩略图另发一次） */
export const HTTP_HD_JPEG_MAX_BYTES = 900 * 1024

/** 风格样图：竖版人像 3:4 */
export const STYLE_SAMPLE_RATIO = 3 / 4
export const STYLE_SAMPLE_WIDTH = 540
export const STYLE_SAMPLE_HEIGHT = 720
export const STYLE_SAMPLE_MAX_BYTES = 8 * 1024 * 1024
export const STYLE_SAMPLE_RATIO_TOLERANCE = 0.08
export const STYLE_SAMPLE_HD_MAX_BYTES = 5 * 1024 * 1024

export const STYLE_SAMPLE_TIP =
  '请上传 3:4 竖图（建议 2K 1728×2304 或 4K 3520×4704）；默认整图等比缩小进 540×720 取景框（2K 为 3.2×，4K 约 6.5×），可缩放平移后导出缩略图'

/** 源图内可选取的最小 3:4 窗口宽（像素），限制最大放大倍数 */
export const STYLE_SAMPLE_MIN_SOURCE_CROP_WIDTH = 120

/** 2K 竖图 1728×2304 → 540×720 的等比缩小倍数 */
export const STYLE_SAMPLE_THUMB_SCALE_2K = 1728 / STYLE_SAMPLE_WIDTH

/** 4K 竖图 3520×4704 → 540×720 的等比缩小倍数（与 Seedream 4K 规格一致） */
export const STYLE_SAMPLE_THUMB_SCALE_4K = 3520 / STYLE_SAMPLE_WIDTH

/** Seedream 官方 HD 尺寸，用于识别档位 */
export const SEEDREAM_HD_SIZE_TIERS = {
  '1728x2304': { tier: '2K', landscape: false },
  '2304x1728': { tier: '2K', landscape: true },
  '3520x4704': { tier: '4K', landscape: false },
  '4704x3520': { tier: '4K', landscape: true }
}

export function loadImageFromFile(file) {
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
    throw new Error('图片不能超过 8MB')
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

/** 源图内能取到的最大 3:4 矩形（zoom=1 时取景框对应区域） */
export function getMaxCropRect(img, ratio = STYLE_SAMPLE_RATIO) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const srcRatio = srcW / srcH
  let cropWidth = srcW
  let cropHeight = srcH
  if (srcRatio > ratio) {
    cropWidth = Math.round(srcH * ratio)
  } else if (srcRatio < ratio) {
    cropHeight = Math.round(srcW / ratio)
  }
  return { srcW, srcH, cropWidth, cropHeight }
}

/**
 * HD → 缩略图逻辑尺寸的等比缩小倍数。
 * 竖图：1728×2304 → 540×720（3.2×）；横图：2304×1728 → 720×540（3.2×）。
 * 4K 竖：3520×4704 → 540×720（约 6.52×）。
 */
export function getHdToThumbScale(img) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const logicalThumbW = srcW >= srcH ? STYLE_SAMPLE_HEIGHT : STYLE_SAMPLE_WIDTH
  return srcW / logicalThumbW
}

/** 裁剪 UI 用：高清图在逻辑缩略图坐标系下的显示尺寸（zoom=1、整图入框时） */
export function getHdLogicalDisplaySize(img) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const thumbScale = getHdToThumbScale(img)
  return {
    width: srcW / thumbScale,
    height: srcH / thumbScale,
    thumbScale
  }
}

export function getHdDisplayInfo(img) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const key = `${srcW}x${srcH}`
  const known = SEEDREAM_HD_SIZE_TIERS[key]
  const { width, height, thumbScale } = getHdLogicalDisplaySize(img)
  return {
    tier: known?.tier || null,
    landscape: srcW > srcH,
    hdWidth: srcW,
    hdHeight: srcH,
    thumbScale: Math.round(thumbScale * 100) / 100,
    logicalWidth: Math.round(width),
    logicalHeight: Math.round(height)
  }
}

/** 裁剪预览：UI 帧宽 270 对应逻辑缩略图宽 540，再按 HD/thumbScale 显示整图 */
export function getCropUiDisplayScale(img, sourceCropWidth, uiFrameWidth = STYLE_SAMPLE_WIDTH / 2) {
  if (!img || !sourceCropWidth) return 1
  const thumbScale = getHdToThumbScale(img)
  const baseScale = uiFrameWidth / STYLE_SAMPLE_WIDTH / thumbScale
  const { cropWidth: maxW } = getMaxCropRect(img)
  const zoomFactor = maxW / sourceCropWidth
  return baseScale * zoomFactor
}

export function getZoomLimits(img, ratio = STYLE_SAMPLE_RATIO) {
  const { cropWidth: maxW } = getMaxCropRect(img, ratio)
  const minCropW = Math.max(
    STYLE_SAMPLE_MIN_SOURCE_CROP_WIDTH,
    Math.round(maxW * 0.12)
  )
  const maxZoom = Math.max(1, maxW / minCropW)
  return { minZoom: 1, maxZoom }
}

/** zoom=1 适应最大 3:4 区域；zoom 越大取景框内源像素越少（放大） */
export function getSourceCropSize(img, zoom, ratio = STYLE_SAMPLE_RATIO) {
  const { cropWidth: maxW, cropHeight: maxH } = getMaxCropRect(img, ratio)
  const { minZoom, maxZoom } = getZoomLimits(img, ratio)
  const z = Math.min(maxZoom, Math.max(minZoom, zoom))
  const sourceCropWidth = Math.max(1, Math.round(maxW / z))
  const sourceCropHeight = Math.max(1, Math.round(maxH / z))
  return {
    zoom: z,
    sourceCropWidth,
    sourceCropHeight,
    maxCropWidth: maxW,
    maxCropHeight: maxH
  }
}

export function clampCropView(img, offsetX, offsetY, zoom, ratio = STYLE_SAMPLE_RATIO) {
  const { srcW, srcH } = getMaxCropRect(img, ratio)
  const { zoom: z, sourceCropWidth, sourceCropHeight } = getSourceCropSize(img, zoom, ratio)
  let ox = Math.round(offsetX)
  let oy = Math.round(offsetY)
  ox = Math.max(0, Math.min(ox, srcW - sourceCropWidth))
  oy = Math.max(0, Math.min(oy, srcH - sourceCropHeight))
  return {
    offsetX: ox,
    offsetY: oy,
    zoom: z,
    sourceCropWidth,
    sourceCropHeight
  }
}

export function getDefaultCropView(img, ratio = STYLE_SAMPLE_RATIO) {
  const { srcW, srcH } = getMaxCropRect(img, ratio)
  const { sourceCropWidth, sourceCropHeight, zoom } = getSourceCropSize(img, 1, ratio)
  const isFullFrame = sourceCropWidth === srcW && sourceCropHeight === srcH
  const ox = isFullFrame ? 0 : Math.floor((srcW - sourceCropWidth) / 2)
  const oy = isFullFrame ? 0 : Math.floor((srcH - sourceCropHeight) / 2)
  return clampCropView(img, ox, oy, zoom, ratio)
}

/** @deprecated 兼容旧调用，等价于 getDefaultCropView */
export function calculateCropOffset(img, ratio = STYLE_SAMPLE_RATIO) {
  const view = getDefaultCropView(img, ratio)
  return {
    offsetX: view.offsetX,
    offsetY: view.offsetY,
    cropWidth: view.sourceCropWidth,
    cropHeight: view.sourceCropHeight
  }
}

export function cropThumbnailFromImage(img, offsetX, offsetY, zoom = 1) {
  const srcRatio = (img.naturalWidth || img.width) / (img.naturalHeight || img.height)
  const diff = Math.abs(srcRatio - STYLE_SAMPLE_RATIO) / STYLE_SAMPLE_RATIO
  const cropped = diff > STYLE_SAMPLE_RATIO_TOLERANCE

  const view = clampCropView(img, offsetX, offsetY, zoom, STYLE_SAMPLE_RATIO)

  const canvas = document.createElement('canvas')
  canvas.width = STYLE_SAMPLE_WIDTH
  canvas.height = STYLE_SAMPLE_HEIGHT
  const ctx = canvas.getContext('2d')
  ctx.drawImage(
    img,
    view.offsetX,
    view.offsetY,
    view.sourceCropWidth,
    view.sourceCropHeight,
    0,
    0,
    STYLE_SAMPLE_WIDTH,
    STYLE_SAMPLE_HEIGHT
  )

  const packed = compressCanvasToJpegPayload(canvas)

  return {
    base64: packed.base64,
    previewUrl: packed.previewUrl,
    cropped,
    ...view
  }
}

export async function prepareHdSampleFromImage(img) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height

  const canvas = document.createElement('canvas')
  canvas.width = srcW
  canvas.height = srcH
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)

  const packed = compressCanvasToJpegPayload(canvas, HTTP_HD_JPEG_MAX_BYTES)

  return {
    base64: packed.base64,
    previewUrl: packed.previewUrl,
    byteSize: packed.byteSize
  }
}

export async function processStyleSampleFileWithCrop(file) {
  if (!file) throw new Error('请选择图片')
  if (file.size > STYLE_SAMPLE_MAX_BYTES) {
    throw new Error('图片不能超过 8MB')
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  if (file.type && !allowed.includes(file.type)) {
    throw new Error('仅支持 JPG、PNG、WebP')
  }

  const img = await loadImageFromFile(file)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height
  if (naturalWidth < 270 || naturalHeight < 360) {
    throw new Error('图片过小，短边建议不小于 360px')
  }

  const { offsetX, offsetY, zoom } = getDefaultCropView(img, STYLE_SAMPLE_RATIO)

  const thumbnail = cropThumbnailFromImage(img, offsetX, offsetY, zoom)
  const hd = await prepareHdSampleFromImage(img)

  return {
    img,
    thumbnailBase64: thumbnail.base64,
    thumbnailPreviewUrl: thumbnail.previewUrl,
    hdBase64: hd.base64,
    hdPreviewUrl: hd.previewUrl,
    offsetX,
    offsetY,
    zoom,
    naturalWidth,
    naturalHeight,
    cropped: thumbnail.cropped
  }
}
