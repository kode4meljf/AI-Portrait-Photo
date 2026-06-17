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

/** 云数据库 where：按适用性别筛选（与 adminApi buildStyleListWhere 一致） */
function buildStyleGenderDbWhere(db, genderLabel) {
  const genderRaw = String(genderLabel || '').trim()
  if (!genderRaw) return null
  const _ = db.command
  const g = normalizeStyleGender(genderRaw)
  if (g === STYLE_GENDER_FEMALE) {
    return { gender: STYLE_GENDER_FEMALE }
  }
  return _.or([
    { gender: STYLE_GENDER_MALE },
    { gender: _.exists(false) },
    { gender: '' }
  ])
}

module.exports = {
  STYLE_GENDER_MALE,
  STYLE_GENDER_FEMALE,
  DEFAULT_STYLE_GENDER,
  normalizeStyleGender,
  styleGenderFromCustomer,
  filterStylesByGender,
  buildStyleGenderDbWhere
}
