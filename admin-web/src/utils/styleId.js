import { DEFAULT_STYLE_GENDER, normalizeStyleGender } from './styleGender'

export const STYLE_SLOTS_PER_GENDER = 30
export const STYLE_MAX_COUNT = STYLE_SLOTS_PER_GENDER * 2
export const STYLE_MAX_ENABLED = STYLE_MAX_COUNT

const FM_ID_RE = /^([FM])(\d{2})$/i
const LEGACY_S_ID_RE = /^S(\d{1,2})$/i

function genderToPrefix(gender) {
  return normalizeStyleGender(gender) === '女' ? 'F' : 'M'
}

export function formatGenderStyleCode(gender, num) {
  const n = Number(num)
  if (!Number.isFinite(n) || n < 1 || n > STYLE_SLOTS_PER_GENDER) {
    throw new Error(`风格序号须在 1–${STYLE_SLOTS_PER_GENDER} 之间`)
  }
  return `${genderToPrefix(gender)}${String(n).padStart(2, '0')}`
}

export function parseStyleCode(id) {
  const text = String(id || '').trim()
  const fm = text.match(FM_ID_RE)
  if (fm) {
    const prefix = fm[1].toUpperCase()
    const num = Number(fm[2])
    if (num < 1 || num > STYLE_SLOTS_PER_GENDER) return null
    return { prefix, num, legacy: false }
  }
  const sm = text.match(LEGACY_S_ID_RE)
  if (sm) {
    const num = Number(sm[1])
    if (num < 1) return null
    return { prefix: 'S', num, legacy: true }
  }
  return null
}

export function styleIdRangeLabel(gender = DEFAULT_STYLE_GENDER) {
  const prefix = genderToPrefix(gender)
  return `${prefix}01–${prefix}${String(STYLE_SLOTS_PER_GENDER).padStart(2, '0')}`
}

export function styleIdFullRangeLabel() {
  return `F01–F${String(STYLE_SLOTS_PER_GENDER).padStart(2, '0')}、M01–M${String(STYLE_SLOTS_PER_GENDER).padStart(2, '0')}`
}

function collectUsedSlots(list, gender) {
  const prefix = genderToPrefix(gender)
  const used = new Set()
  ;(list || []).forEach((row) => {
    const parsed = parseStyleCode(row.id)
    if (parsed && !parsed.legacy && parsed.prefix === prefix) used.add(parsed.num)
  })
  return used
}

export function allocateStyleIdFromList(list, gender = DEFAULT_STYLE_GENDER) {
  const normalizedGender = normalizeStyleGender(gender)
  if ((list || []).length >= STYLE_MAX_COUNT) {
    throw new Error(`风格最多 ${STYLE_MAX_COUNT} 个（${styleIdFullRangeLabel()}）`)
  }
  const used = collectUsedSlots(list, normalizedGender)
  if (used.size >= STYLE_SLOTS_PER_GENDER) {
    throw new Error(`${styleIdRangeLabel(normalizedGender)} 已满`)
  }
  for (let i = 1; i <= STYLE_SLOTS_PER_GENDER; i += 1) {
    if (!used.has(i)) return formatGenderStyleCode(normalizedGender, i)
  }
  throw new Error(`${styleIdRangeLabel(normalizedGender)} 已满`)
}

export function previewNextStyleId(list, gender = DEFAULT_STYLE_GENDER) {
  try {
    return allocateStyleIdFromList(list, gender)
  } catch {
    return null
  }
}

/** @deprecated 使用 formatGenderStyleCode */
export function formatStyleCode(num) {
  return `S${String(num).padStart(2, '0')}`
}
