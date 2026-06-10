const GENDER_MALE = 'male'
const GENDER_FEMALE = 'female'
const DEFAULT_GENDER = GENDER_MALE

function normalizeGender(value) {
  if (value === GENDER_FEMALE || value === 'female' || value === '女') return GENDER_FEMALE
  return GENDER_MALE
}

function genderLabel(value) {
  return normalizeGender(value) === GENDER_FEMALE ? '女' : '男'
}

module.exports = {
  GENDER_MALE,
  GENDER_FEMALE,
  DEFAULT_GENDER,
  normalizeGender,
  genderLabel
}
