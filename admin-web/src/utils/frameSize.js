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
  const sizeUnit = (form.sizeUnit || 'cm').trim() || 'cm'
  const empty = (v) => v === '' || v == null
  const hasFirst = !empty(form.sizeFirst)
  const hasSecond = !empty(form.sizeSecond)

  if (!hasFirst && !hasSecond) {
    return {
      sizeAxis,
      sizeUnit,
      sizeFirst: null,
      sizeSecond: null,
      size: ''
    }
  }
  if (!hasFirst || !hasSecond) {
    throw new Error('请同时填写两个尺寸，或全部留空')
  }
  const sizeFirst = Number(form.sizeFirst)
  const sizeSecond = Number(form.sizeSecond)
  if (!Number.isFinite(sizeFirst) || !Number.isFinite(sizeSecond) || sizeFirst <= 0 || sizeSecond <= 0) {
    throw new Error('尺寸须为大于 0 的数字')
  }
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
