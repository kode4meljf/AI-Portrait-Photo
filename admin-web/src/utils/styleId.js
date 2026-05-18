export const STYLE_MAX_COUNT = 12

export function formatStyleCode(num) {
  return `S${String(num).padStart(2, '0')}`
}

export function parseStyleCode(id) {
  const m = String(id || '').match(/^S(\d{1,2})$/i)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= STYLE_MAX_COUNT ? n : null
}

export function allocateStyleIdFromList(list) {
  const used = new Set()
  list.forEach((row) => {
    const n = parseStyleCode(row.id)
    if (n) used.add(n)
  })
  if (list.length >= STYLE_MAX_COUNT) {
    throw new Error(`风格最多 ${STYLE_MAX_COUNT} 个（S01–S12）`)
  }
  for (let i = 1; i <= STYLE_MAX_COUNT; i++) {
    if (!used.has(i)) return formatStyleCode(i)
  }
  throw new Error('风格编号 S01–S12 已满')
}

export function previewNextStyleId(list) {
  try {
    return allocateStyleIdFromList(list)
  } catch {
    return null
  }
}
