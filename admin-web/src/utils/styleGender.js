export const STYLE_GENDER_MALE = '男'
export const STYLE_GENDER_FEMALE = '女'
export const DEFAULT_STYLE_GENDER = STYLE_GENDER_MALE

export const STYLE_GENDER_OPTIONS = [
  { label: '男', value: STYLE_GENDER_MALE },
  { label: '女', value: STYLE_GENDER_FEMALE }
]

export function normalizeStyleGender(value) {
  const s = String(value || '').trim()
  if (s === STYLE_GENDER_FEMALE || s === 'female' || s === '女') return STYLE_GENDER_FEMALE
  return STYLE_GENDER_MALE
}
