const STYLE_GENDER_MALE = '男'
const STYLE_GENDER_FEMALE = '女'
const DEFAULT_STYLE_GENDER = STYLE_GENDER_MALE

function normalizeStyleGender(value) {
  const s = String(value || '').trim()
  if (s === STYLE_GENDER_FEMALE || s === 'female' || s === '女') return STYLE_GENDER_FEMALE
  return STYLE_GENDER_MALE
}

function formatStyleGenderRow(row) {
  if (!row || typeof row !== 'object') return row
  const gender = normalizeStyleGender(row.gender)
  return { ...row, gender }
}

module.exports = {
  STYLE_GENDER_MALE,
  STYLE_GENDER_FEMALE,
  DEFAULT_STYLE_GENDER,
  normalizeStyleGender,
  formatStyleGenderRow
}
