export const SEEDREAM_SIZE_TIER_2K = '2k'
export const SEEDREAM_SIZE_TIER_4K = '4k'
export const DEFAULT_SEEDREAM_SIZE_TIER = SEEDREAM_SIZE_TIER_2K

export const SEEDREAM_ORIENTATION_LANDSCAPE = 'landscape'
export const SEEDREAM_ORIENTATION_PORTRAIT = 'portrait'
export const SEEDREAM_ORIENTATION_AUTO = 'auto'
export const DEFAULT_SEEDREAM_ORIENTATION = SEEDREAM_ORIENTATION_PORTRAIT

export const SEEDREAM_SIZE_TIER_OPTIONS = [
  { label: '2K', value: SEEDREAM_SIZE_TIER_2K },
  { label: '4K', value: SEEDREAM_SIZE_TIER_4K }
]

export const SEEDREAM_ORIENTATION_OPTIONS = [
  { label: '横图', value: SEEDREAM_ORIENTATION_LANDSCAPE },
  { label: '竖图', value: SEEDREAM_ORIENTATION_PORTRAIT },
  { label: '自动', value: SEEDREAM_ORIENTATION_AUTO }
]

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

export function normalizeSeedreamSizeTier(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === SEEDREAM_SIZE_TIER_4K) return SEEDREAM_SIZE_TIER_4K
  return SEEDREAM_SIZE_TIER_2K
}

export function normalizeSeedreamOrientation(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === SEEDREAM_ORIENTATION_LANDSCAPE || s === '横' || s === '横图') {
    return SEEDREAM_ORIENTATION_LANDSCAPE
  }
  if (s === SEEDREAM_ORIENTATION_AUTO || s === '自动') {
    return SEEDREAM_ORIENTATION_AUTO
  }
  return SEEDREAM_ORIENTATION_PORTRAIT
}

export function resolveSeedreamOutputSize(tier, orientation) {
  const t = normalizeSeedreamSizeTier(tier)
  const o = normalizeSeedreamOrientation(orientation)
  if (o === SEEDREAM_ORIENTATION_AUTO) return null
  const map = SEEDREAM_OUTPUT_SIZE_MAP[t] || SEEDREAM_OUTPUT_SIZE_MAP[SEEDREAM_SIZE_TIER_2K]
  return map[o] || map[SEEDREAM_ORIENTATION_PORTRAIT]
}

export function describeSeedreamOutputSize(tier, orientation) {
  const size = resolveSeedreamOutputSize(tier, orientation)
  if (!size) return '自动（官方默认，不传 size）'
  return size.replace('x', ' × ')
}
