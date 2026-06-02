/** 即梦成片分辨率（宽:高），与 style_templates.resolution、ai_tasks 一致 */
const DEFAULT_STYLE_RESOLUTION = '1536:1152'

function normalizeStyleResolution(raw, { fallback = DEFAULT_STYLE_RESOLUTION } = {}) {
  const text = String(raw != null && raw !== '' ? raw : fallback).trim()
  const m = text.match(/^(\d+):(\d+)$/)
  if (!m) {
    throw new Error('分辨率格式须为 宽:高，如 1536:1152')
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

module.exports = {
  DEFAULT_STYLE_RESOLUTION,
  normalizeStyleResolution
}
