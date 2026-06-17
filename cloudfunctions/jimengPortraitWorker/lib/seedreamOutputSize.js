const SEEDREAM_SIZE_TIER_2K = '2k'
const SEEDREAM_SIZE_TIER_4K = '4k'
const DEFAULT_SEEDREAM_SIZE_TIER = SEEDREAM_SIZE_TIER_2K

const SEEDREAM_ORIENTATION_LANDSCAPE = 'landscape'
const SEEDREAM_ORIENTATION_PORTRAIT = 'portrait'
const SEEDREAM_ORIENTATION_AUTO = 'auto'
const DEFAULT_SEEDREAM_ORIENTATION = SEEDREAM_ORIENTATION_PORTRAIT

const SEEDREAM_OUTPUT_SIZE_MAP = {
  [SEEDREAM_SIZE_TIER_2K]: {
    [SEEDREAM_ORIENTATION_LANDSCAPE]: '2304x1728',
    [SEEDREAM_ORIENTATION_PORTRAIT]: '1728x2304'
  },
  [SEEDREAM_SIZE_TIER_4K]: {
    [SEEDREAM_ORIENTATION_LANDSCAPE]: '4704x3520',
    [SEEDREAM_ORIENTATION_PORTRAIT]: '3520x4704'
  }
}

function normalizeSeedreamSizeTier(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === SEEDREAM_SIZE_TIER_4K || s === '4k') return SEEDREAM_SIZE_TIER_4K
  return SEEDREAM_SIZE_TIER_2K
}

function normalizeSeedreamOrientation(value) {
  const s = String(value || '').trim().toLowerCase()
  if (
    s === SEEDREAM_ORIENTATION_LANDSCAPE ||
    s === 'horizontal' ||
    s === 'landscape' ||
    s === '横' ||
    s === '横图'
  ) {
    return SEEDREAM_ORIENTATION_LANDSCAPE
  }
  if (s === SEEDREAM_ORIENTATION_AUTO || s === 'auto' || s === '自动') {
    return SEEDREAM_ORIENTATION_AUTO
  }
  return SEEDREAM_ORIENTATION_PORTRAIT
}

/** @returns {string|null} null 表示自动，请求不传 size */
function resolveSeedreamOutputSize(tier, orientation) {
  const t = normalizeSeedreamSizeTier(tier)
  const o = normalizeSeedreamOrientation(orientation)
  if (o === SEEDREAM_ORIENTATION_AUTO) return null
  const map = SEEDREAM_OUTPUT_SIZE_MAP[t] || SEEDREAM_OUTPUT_SIZE_MAP[SEEDREAM_SIZE_TIER_2K]
  return map[o] || map[SEEDREAM_ORIENTATION_PORTRAIT]
}

function describeSeedreamOutputSize(tier, orientation) {
  const size = resolveSeedreamOutputSize(tier, orientation)
  if (!size) return '自动（官方默认）'
  return size.replace('x', ' × ')
}

module.exports = {
  SEEDREAM_SIZE_TIER_2K,
  SEEDREAM_SIZE_TIER_4K,
  DEFAULT_SEEDREAM_SIZE_TIER,
  SEEDREAM_ORIENTATION_LANDSCAPE,
  SEEDREAM_ORIENTATION_PORTRAIT,
  SEEDREAM_ORIENTATION_AUTO,
  DEFAULT_SEEDREAM_ORIENTATION,
  normalizeSeedreamSizeTier,
  normalizeSeedreamOrientation,
  resolveSeedreamOutputSize,
  describeSeedreamOutputSize
}
