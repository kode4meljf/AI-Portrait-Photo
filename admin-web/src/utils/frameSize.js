/** 摆台相框尺寸（cm），与 adminApi frameSizeValidate 保持一致 */
export const FRAME_SIZE_SIDE_MIN = 5
export const FRAME_SIZE_SIDE_MAX = 150
export const FRAME_SIZE_MAX_RATIO = 5

export const SIZE_FORM_HINT =
  `选填；单位 cm，单边 ${FRAME_SIZE_SIDE_MIN}–${FRAME_SIZE_SIDE_MAX}，长宽比不超过 ${FRAME_SIZE_MAX_RATIO}:1`

function roundSizeCm(n) {
  return Math.round(Number(n) * 10) / 10
}

function isSizeEmpty(v) {
  return v === '' || v == null || v === undefined
}

function validateFrameSizeSides(sizeFirst, sizeSecond, sizeUnit = 'cm') {
  const unit = (sizeUnit || 'cm').trim().toLowerCase() || 'cm'
  if (unit !== 'cm') {
    throw new Error('当前仅支持 cm（厘米）')
  }

  const a = roundSizeCm(sizeFirst)
  const b = roundSizeCm(sizeSecond)
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new Error('尺寸须为有效数字')
  }
  if (a <= 0 || b <= 0) {
    throw new Error('尺寸须大于 0')
  }
  if (a < FRAME_SIZE_SIDE_MIN || b < FRAME_SIZE_SIDE_MIN) {
    throw new Error(`单边尺寸不能小于 ${FRAME_SIZE_SIDE_MIN}cm`)
  }
  if (a > FRAME_SIZE_SIDE_MAX || b > FRAME_SIZE_SIDE_MAX) {
    throw new Error(`单边尺寸不能大于 ${FRAME_SIZE_SIDE_MAX}cm`)
  }

  const long = Math.max(a, b)
  const short = Math.min(a, b)
  if (short > 0 && long / short > FRAME_SIZE_MAX_RATIO) {
    throw new Error(`长宽比不能超过 ${FRAME_SIZE_MAX_RATIO}:1，请检查是否填错`)
  }

  return { sizeFirst: a, sizeSecond: b, sizeUnit: unit }
}

/** 列表/详情展示 */
export function formatFrameSizeDisplay(row) {
  if (row.sizeFirst != null && row.sizeSecond != null) {
    const u = row.sizeUnit || 'cm'
    return `长×宽 ${row.sizeFirst}${u} × ${row.sizeSecond}${u}`
  }
  return row.size || '-'
}

export const SIZE_FORM_LABEL = '尺寸（长 × 宽）'

export function buildFrameSizePayload(form) {
  const sizeAxis = 'lw'
  const hasFirst = !isSizeEmpty(form.sizeFirst)
  const hasSecond = !isSizeEmpty(form.sizeSecond)

  if (!hasFirst && !hasSecond) {
    return {
      sizeAxis,
      sizeUnit: 'cm',
      sizeFirst: null,
      sizeSecond: null,
      size: ''
    }
  }
  if (!hasFirst || !hasSecond) {
    throw new Error('请同时填写长、宽两个尺寸，或全部留空')
  }

  const { sizeFirst, sizeSecond, sizeUnit } = validateFrameSizeSides(
    form.sizeFirst,
    form.sizeSecond,
    form.sizeUnit
  )
  return {
    sizeAxis,
    sizeUnit,
    sizeFirst,
    sizeSecond,
    size: `${sizeFirst}${sizeUnit} × ${sizeSecond}${sizeUnit}`
  }
}

export function parseFrameSizeToForm(row) {
  if (row.sizeFirst != null && row.sizeSecond != null) {
    return {
      sizeFirst: row.sizeFirst,
      sizeSecond: row.sizeSecond,
      sizeUnit: row.sizeUnit || 'cm'
    }
  }
  const m = (row.size || '').match(/^(\d+(?:\.\d+)?)\s*(\w+)?\s*[×x]\s*(\d+(?:\.\d+)?)\s*(\w+)?/i)
  if (m) {
    return {
      sizeFirst: Number(m[1]),
      sizeSecond: Number(m[3]),
      sizeUnit: (m[2] || m[4] || 'cm').toLowerCase()
    }
  }
  return {
    sizeFirst: null,
    sizeSecond: null,
    sizeUnit: 'cm'
  }
}
