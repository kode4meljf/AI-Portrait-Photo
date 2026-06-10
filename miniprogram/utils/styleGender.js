const STYLE_GENDER_MALE = '男'
const STYLE_GENDER_FEMALE = '女'
const DEFAULT_STYLE_GENDER = STYLE_GENDER_MALE

function normalizeStyleGender(value) {
  const s = String(value || '').trim()
  if (s === STYLE_GENDER_FEMALE || s === 'female' || s === '女') return STYLE_GENDER_FEMALE
  return STYLE_GENDER_MALE
}

/** 客户 gender (male/female) → 风格库 gender (男/女) */
function styleGenderFromCustomer(customerGender) {
  const s = String(customerGender || '').trim()
  if (s === 'female' || s === STYLE_GENDER_FEMALE || s === '女') return STYLE_GENDER_FEMALE
  return STYLE_GENDER_MALE
}

function filterStylesByGender(pool, genderLabel) {
  const g = normalizeStyleGender(genderLabel)
  return (pool || []).filter((s) => normalizeStyleGender(s.gender) === g)
}

module.exports = {
  STYLE_GENDER_MALE,
  STYLE_GENDER_FEMALE,
  DEFAULT_STYLE_GENDER,
  normalizeStyleGender,
  styleGenderFromCustomer,
  filterStylesByGender
}
