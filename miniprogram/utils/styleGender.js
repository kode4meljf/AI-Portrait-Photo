const STYLE_GENDER_MALE = '男'
const STYLE_GENDER_FEMALE = '女'
const DEFAULT_STYLE_GENDER = STYLE_GENDER_MALE

function normalizeStyleGender(value) {
  const s = String(value || '').trim()
  if (s === STYLE_GENDER_FEMALE || s === 'female' || s === '女') return STYLE_GENDER_FEMALE
  return STYLE_GENDER_MALE
}

/** F01–F30 / M01–M30 编号前缀 → 适用性别（优先于云库 gender 字段） */
function styleGenderFromStyleId(id) {
  const m = String(id || '').trim().match(/^([FM])(\d{2})$/i)
  if (!m) return null
  return m[1].toUpperCase() === 'F' ? STYLE_GENDER_FEMALE : STYLE_GENDER_MALE
}

/** 风格行：编号前缀优先，避免 M 系列误标为「女」导致首页只展示女性样板 */
function resolveStyleGender(row) {
  if (!row) return DEFAULT_STYLE_GENDER
  const fromId = styleGenderFromStyleId(row.id)
  if (fromId) return fromId
  return normalizeStyleGender(row.gender)
}

/** 客户 gender (male/female) → 风格库 gender (男/女) */
function styleGenderFromCustomer(customerGender) {
  const s = String(customerGender || '').trim()
  if (s === 'female' || s === STYLE_GENDER_FEMALE || s === '女') return STYLE_GENDER_FEMALE
  return STYLE_GENDER_MALE
}

function filterStylesByGender(pool, genderLabel) {
  const g = normalizeStyleGender(genderLabel)
  return (pool || []).filter((s) => resolveStyleGender(s) === g)
}

/** 云数据库 where：按适用性别筛选（与 adminApi buildStyleListWhere 一致） */
function buildStyleGenderDbWhere(db, genderLabel) {
  const genderRaw = String(genderLabel || '').trim()
  if (!genderRaw) return null
  const _ = db.command
  const g = normalizeStyleGender(genderRaw)
  if (g === STYLE_GENDER_FEMALE) {
    return _.or([
      { id: db.RegExp({ regexp: '^F\\d{2}$', options: 'i' }) },
      { gender: STYLE_GENDER_FEMALE }
    ])
  }
  return _.or([
    { id: db.RegExp({ regexp: '^M\\d{2}$', options: 'i' }) },
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
  styleGenderFromStyleId,
  resolveStyleGender,
  styleGenderFromCustomer,
  filterStylesByGender,
  buildStyleGenderDbWhere
}
