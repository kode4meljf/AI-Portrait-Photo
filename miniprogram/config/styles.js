/**
 * @file 风格模板：云库读取与展示字段归一化
 */

function parseStyleCode(id) {
  const m = String(id || '').match(/^S(\d{1,2})$/i)
  return m ? Number(m[1]) : 9999
}

function normalizeStyle(row) {
  if (!row) return null
  const sampleFileId = String(
    row.sampleFileId || row.sampleUrl || row.coverFileId || row.coverUrl || ''
  ).trim()
  /** 首页副格横图（可选，16:9 或横版裁切，更适合右侧扁格） */
  const sampleThumbFileId = String(
    row.sampleThumbFileId || row.sampleThumbUrl || row.thumbFileId || ''
  ).trim()
  return {
    _id: row._id || '',
    id: row.id || '',
    name: row.name || '',
    prompt: row.prompt || '',
    sampleFileId,
    sampleThumbFileId,
    sort: row.sort != null ? row.sort : 0,
    enabled: row.enabled !== false
  }
}

function sortStyles(list) {
  return list.slice().sort((a, b) => {
    const na = parseStyleCode(a.id)
    const nb = parseStyleCode(b.id)
    if (na !== nb) return na - nb
    const sa = Number(a.sort) || 0
    const sb = Number(b.sort) || 0
    if (sa !== sb) return sa - sb
    return String(a.id).localeCompare(String(b.id))
  })
}

/**
 * 云 fileID 转 https 展示地址（可选，cloud:// 也可直接用于 image）
 */
async function attachSampleDisplayUrls(styles) {
  if (!styles.length) return []
  const cloudIds = [
    ...new Set(
      styles
        .flatMap((s) => [s.sampleFileId, s.sampleThumbFileId])
        .filter((id) => id && String(id).startsWith('cloud://'))
    )
  ]
  if (!cloudIds.length) {
    return styles.map((s) => ({
      ...s,
      sampleDisplayUrl: s.sampleFileId || '',
      sampleThumbDisplayUrl: s.sampleThumbFileId || ''
    }))
  }
  try {
    const res = await wx.cloud.getTempFileURL({ fileList: cloudIds })
    const map = {}
    ;(res.fileList || []).forEach((item) => {
      if (item.fileID && item.tempFileURL) {
        map[item.fileID] = item.tempFileURL
      }
    })
    return styles.map((s) => ({
      ...s,
      sampleDisplayUrl: map[s.sampleFileId] || s.sampleFileId || '',
      sampleThumbDisplayUrl: map[s.sampleThumbFileId] || s.sampleThumbFileId || ''
    }))
  } catch (e) {
    console.warn('[styles] getTempFileURL 失败', e)
    return styles.map((s) => ({
      ...s,
      sampleDisplayUrl: s.sampleFileId || '',
      sampleThumbDisplayUrl: s.sampleThumbFileId || ''
    }))
  }
}

/**
 * 从 style_templates 拉取启用中的风格（按 sort / S 编号排序）
 */
async function fetchStyleTemplates(db, options = {}) {
  const collection = options.collection || 'style_templates'
  const limit = options.limit || 20
  const onlyEnabled = options.onlyEnabled !== false

  const res = await db.collection(collection).limit(limit).get()
  let list = (res.data || []).map(normalizeStyle).filter((s) => s && s.id)
  if (onlyEnabled) {
    list = list.filter((s) => s.enabled)
  }
  list = sortStyles(list)
  return attachSampleDisplayUrls(list)
}

/**
 * 按 id 列表顺序返回风格（用于生成结果页）
 */
async function fetchStylesByIds(db, styleIds, options = {}) {
  const ids = (styleIds || []).filter(Boolean)
  const pool = await fetchStyleTemplates(db, options)
  if (!ids.length) return pool
  const map = {}
  pool.forEach((s) => {
    map[s.id] = s
  })
  const ordered = ids.map((id) => map[id]).filter(Boolean)
  if (!ordered.length) {
    throw new Error('风格参数无效，请返回重新选择')
  }
  if (ordered.length !== ids.length) {
    const missing = ids.filter((id) => !map[id])
    console.warn('[styles] fetchStylesByIds missing', missing)
    if (ordered.length) return ordered
    throw new Error('部分风格已下架，请返回重新选择')
  }
  return ordered
}

function pickStyles(pool, count) {
  const n = count === 9 ? 9 : 3
  return pool.slice(0, Math.min(n, pool.length))
}

module.exports = {
  fetchStyleTemplates,
  fetchStylesByIds,
  pickStyles
}
