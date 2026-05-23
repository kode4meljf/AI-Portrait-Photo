/** 摆台相框尺寸（cm）校验：与后台表单、小程序展示一致 */
const FRAME_SIZE_UNIT = 'cm'
const FRAME_SIZE_SIDE_MIN = 5
const FRAME_SIZE_SIDE_MAX = 150
const FRAME_SIZE_MAX_RATIO = 5

function roundSizeCm(n) {
  return Math.round(Number(n) * 10) / 10
}

function isSizeEmpty(v) {
  return v === '' || v == null || v === undefined
}

/**
 * 校验并规范化两边尺寸；单位暂仅支持 cm
 * @returns {{ sizeFirst: number, sizeSecond: number, sizeUnit: string }}
 */
function validateFrameSizeSides(sizeFirst, sizeSecond, sizeUnit) {
  const unit = String(sizeUnit || FRAME_SIZE_UNIT).trim().toLowerCase() || FRAME_SIZE_UNIT
  if (unit !== FRAME_SIZE_UNIT) {
    throw new Error(`当前仅支持 ${FRAME_SIZE_UNIT}（厘米）`)
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

module.exports = {
  FRAME_SIZE_UNIT,
  FRAME_SIZE_SIDE_MIN,
  FRAME_SIZE_SIDE_MAX,
  FRAME_SIZE_MAX_RATIO,
  isSizeEmpty,
  validateFrameSizeSides
}
