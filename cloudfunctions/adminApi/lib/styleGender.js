const STYLE_GENDER_MALE = '男'
const STYLE_GENDER_FEMALE = '女'
const DEFAULT_STYLE_GENDER = STYLE_GENDER_MALE

function normalizeStyleGender(value) {
  const s = String(value || '').trim()
  if (s === STYLE_GENDER_FEMALE || s === 'female' || s === '女') return STYLE_GENDER_FEMALE
  return STYLE_GENDER_MALE
}

function styleGenderFromStyleId(id) {
  const m = String(id || '').trim().match(/^([FM])(\d{2})$/i)
  if (!m) return null
  return m[1].toUpperCase() === 'F' ? STYLE_GENDER_FEMALE : STYLE_GENDER_MALE
}

function resolveStyleGender(row) {
  if (!row) return DEFAULT_STYLE_GENDER
  const fromId = styleGenderFromStyleId(row.id)
  if (fromId) return fromId
  return normalizeStyleGender(row.gender)
}

function formatStyleGenderRow(row) {
  if (!row || typeof row !== 'object') return row
  const gender = resolveStyleGender(row)
  return { ...row, gender }
}

module.exports = {
  STYLE_GENDER_MALE,
  STYLE_GENDER_FEMALE,
  DEFAULT_STYLE_GENDER,
  normalizeStyleGender,
  styleGenderFromStyleId,
  resolveStyleGender,
  formatStyleGenderRow
}
