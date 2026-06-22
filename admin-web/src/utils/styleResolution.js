/** 与 adminApi styleResolution 保持一致（经典引擎即梦成片 3:4 竖图） */
export const DEFAULT_STYLE_RESOLUTION = '1152:1536'
export const DEFAULT_RESOLUTION_WIDTH = 1152
export const DEFAULT_RESOLUTION_HEIGHT = 1536
export const RESOLUTION_SIDE_MIN = 256
export const RESOLUTION_SIDE_MAX = 4096

export const STYLE_RESOLUTION_HINT =
  '即梦成片输出宽高（宽×高），与上方 3:4 样图无关。样图在小程序以 3:4 竖图展示，建议成片也用 3:4 竖图（默认 1152×1536）。'

export function parseStyleResolution(raw) {
  const text = String(raw != null && raw !== '' ? raw : DEFAULT_STYLE_RESOLUTION).trim()
  const m = text.match(/^(\d+):(\d+)$/)
  if (!m) {
    return { width: DEFAULT_RESOLUTION_WIDTH, height: DEFAULT_RESOLUTION_HEIGHT }
  }
  return { width: Number(m[1]), height: Number(m[2]) }
}

export function buildStyleResolution(width, height) {
  return normalizeStyleResolution(`${width}:${height}`)
}

export function normalizeStyleResolution(raw, { fallback = DEFAULT_STYLE_RESOLUTION } = {}) {
  const text = String(raw != null && raw !== '' ? raw : fallback).trim()
  const m = text.match(/^(\d+):(\d+)$/)
  if (!m) {
    throw new Error('分辨率格式须为 宽:高，如 1152:1536')
  }
  const w = Number(m[1])
  const h = Number(m[2])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    throw new Error('分辨率须为大于 0 的整数')
  }
  if (w < 256 || h < 256) {
    throw new Error('宽和高均不能小于 256')
  }
  if (w > 4096 || h > 4096) {
    throw new Error('宽和高均不能大于 4096')
  }
  return `${w}:${h}`
}
