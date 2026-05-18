export const FRAME_MAX_COUNT = 99

export function formatFrameCode(num) {
  return `F${String(num).padStart(2, '0')}`
}

export function parseFrameCode(id) {
  const m = String(id || '').match(/^F(\d{1,2})$/i)
  if (!m) return null
  const n = Number(m[1])
  return n >= 1 && n <= FRAME_MAX_COUNT ? n : null
}

export function allocateFrameIdFromList(list) {
  const used = new Set()
  list.forEach((row) => {
    const n = parseFrameCode(row.id)
    if (n) used.add(n)
  })
  if (list.length >= FRAME_MAX_COUNT) {
    throw new Error(`相框最多 ${FRAME_MAX_COUNT} 个（F01 起）`)
  }
  for (let i = 1; i <= FRAME_MAX_COUNT; i++) {
    if (!used.has(i)) return formatFrameCode(i)
  }
  throw new Error('相框编号已满')
}

export function previewNextFrameId(list) {
  try {
    return allocateFrameIdFromList(list)
  } catch {
    return null
  }
}
