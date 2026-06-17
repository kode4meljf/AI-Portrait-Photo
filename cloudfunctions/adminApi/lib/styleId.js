/**
 * 风格业务 ID：F01–F30（女）、M01–M30（男）
 * 兼容旧数据 S01–S99 排序靠后
 */
const { normalizeStyleGender, STYLE_GENDER_FEMALE } = require('./styleGender')

const STYLE_SLOTS_PER_GENDER = 30
const STYLE_MAX_COUNT = STYLE_SLOTS_PER_GENDER * 2
const STYLE_MAX_ENABLED = STYLE_MAX_COUNT

const FM_ID_RE = /^([FM])(\d{2})$/i
const LEGACY_S_ID_RE = /^S(\d{1,2})$/i

function genderToPrefix(gender) {
  return normalizeStyleGender(gender) === STYLE_GENDER_FEMALE ? 'F' : 'M'
}

function formatGenderStyleCode(gender, num) {
  const n = Number(num)
  if (!Number.isFinite(n) || n < 1 || n > STYLE_SLOTS_PER_GENDER) {
    throw new Error(`风格序号须在 1–${STYLE_SLOTS_PER_GENDER} 之间`)
  }
  return `${genderToPrefix(gender)}${String(n).padStart(2, '0')}`
}

function parseStyleCode(id) {
  const text = String(id || '').trim()
  const fm = text.match(FM_ID_RE)
  if (fm) {
    const prefix = fm[1].toUpperCase()
    const num = Number(fm[2])
    if (num < 1 || num > STYLE_SLOTS_PER_GENDER) return null
    return {
      prefix,
      num,
      gender: prefix === 'F' ? STYLE_GENDER_FEMALE : '男',
      legacy: false
    }
  }
  const sm = text.match(LEGACY_S_ID_RE)
  if (sm) {
    const num = Number(sm[1])
    if (num < 1) return null
    return { prefix: 'S', num, gender: null, legacy: true }
  }
  return null
}

function compareStyleId(a, b) {
  const pa = parseStyleCode(a && a.id)
  const pb = parseStyleCode(b && b.id)
  if (pa && pb) {
    const order = { F: 0, M: 1, S: 2 }
    const oa = order[pa.prefix] ?? 9
    const ob = order[pb.prefix] ?? 9
    if (oa !== ob) return oa - ob
    return pa.num - pb.num
  }
  if (pa && !pb) return -1
  if (!pa && pb) return 1
  return String((a && a.id) || '').localeCompare(String((b && b.id) || ''))
}

function styleIdRangeLabel(gender) {
  const prefix = genderToPrefix(gender)
  return `${prefix}01–${prefix}${String(STYLE_SLOTS_PER_GENDER).padStart(2, '0')}`
}

function styleIdFullRangeLabel() {
  return `F01–F${String(STYLE_SLOTS_PER_GENDER).padStart(2, '0')}、M01–M${String(STYLE_SLOTS_PER_GENDER).padStart(2, '0')}`
}

function normalizeStyleBusinessId(raw, gender) {
  const id = String(raw || '').trim().toUpperCase()
  if (!id) throw new Error('缺少风格编号')
  const parsed = parseStyleCode(id)
  if (!parsed || parsed.legacy) {
    throw new Error(`风格编号须为 ${styleIdFullRangeLabel()}`)
  }
  const expected = genderToPrefix(gender)
  if (parsed.prefix !== expected) {
    throw new Error(`编号 ${id} 与适用性别「${normalizeStyleGender(gender)}」不匹配（应为 ${expected} 开头）`)
  }
  return id
}

function collectUsedSlots(rows, gender) {
  const prefix = genderToPrefix(gender)
  const used = new Set()
  ;(rows || []).forEach((row) => {
    const parsed = parseStyleCode(row.id)
    if (parsed && !parsed.legacy && parsed.prefix === prefix) used.add(parsed.num)
  })
  return used
}

function allocateStyleIdFromRows(rows, gender) {
  const normalizedGender = normalizeStyleGender(gender)
  const prefix = genderToPrefix(normalizedGender)
  const allRows = rows || []
  if (allRows.length >= STYLE_MAX_COUNT) {
    throw new Error(`风格最多 ${STYLE_MAX_COUNT} 个（${styleIdFullRangeLabel()}）`)
  }
  const used = collectUsedSlots(allRows, normalizedGender)
  if (used.size >= STYLE_SLOTS_PER_GENDER) {
    throw new Error(`${styleIdRangeLabel(normalizedGender)} 已满`)
  }
  for (let i = 1; i <= STYLE_SLOTS_PER_GENDER; i += 1) {
    if (!used.has(i)) return formatGenderStyleCode(normalizedGender, i)
  }
  throw new Error(`${styleIdRangeLabel(normalizedGender)} 已满`)
}

module.exports = {
  STYLE_SLOTS_PER_GENDER,
  STYLE_MAX_COUNT,
  STYLE_MAX_ENABLED,
  genderToPrefix,
  formatGenderStyleCode,
  parseStyleCode,
  compareStyleId,
  styleIdRangeLabel,
  styleIdFullRangeLabel,
  normalizeStyleBusinessId,
  collectUsedSlots,
  allocateStyleIdFromRows
}
