/**
 * @file 风格模板：云库读取与展示字段归一化
 */

const { normalizeStyleGender, buildStyleGenderDbWhere } = require('../utils/styleGender')

function parseStyleCode(id) {
  const text = String(id || '').trim()
  const fm = text.match(/^([FM])(\d{2})$/i)
  if (fm) {
    const prefix = fm[1].toUpperCase()
    const num = Number(fm[2])
    if (num >= 1 && num <= 30) {
      return (prefix === 'F' ? 0 : 1000) + num
    }
  }
  const sm = text.match(/^S(\d{1,2})$/i)
  if (sm) return 9000 + Number(sm[1])
  return 9999
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
  /** 高清大图（可选，用于大图预览） */
  const sampleHdFileId = String(
    row.sampleHdFileId || row.sampleHdUrl || row.hdFileId || row.hdUrl || ''
  ).trim()
  return {
    _id: row._id || '',
    id: row.id || '',
    name: row.name || '',
    prompt: row.prompt || '',
    sampleFileId,
    sampleThumbFileId,
    sampleHdFileId,
    sort: row.sort != null ? row.sort : 0,
    enabled: row.enabled !== false,
    gender: normalizeStyleGender(row.gender)
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
        .flatMap((s) => [s.sampleFileId, s.sampleThumbFileId, s.sampleHdFileId])
        .filter((id) => id && String(id).startsWith('cloud://'))
    )
  ]
  if (!cloudIds.length) {
    return styles.map((s) => ({
      ...s,
      sampleDisplayUrl: s.sampleFileId || '',
      sampleThumbDisplayUrl: s.sampleThumbFileId || '',
      sampleHdDisplayUrl: s.sampleHdFileId || ''
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
      sampleThumbDisplayUrl: map[s.sampleThumbFileId] || s.sampleThumbFileId || '',
      sampleHdDisplayUrl: map[s.sampleHdFileId] || s.sampleHdFileId || ''
    }))
  } catch (e) {
    console.warn('[styles] getTempFileURL 失败', e)
    return styles.map((s) => ({
      ...s,
      sampleDisplayUrl: s.sampleFileId || '',
      sampleThumbDisplayUrl: s.sampleThumbFileId || '',
      sampleHdDisplayUrl: s.sampleHdFileId || ''
    }))
  }
}

/**
 * 从 style_templates 拉取启用中的风格（按 sort / S 编号排序）
 */
/** 云库 style_templates 单次拉取上限（与后台 STYLE_MAX_COUNT 对齐并留余量） */
const STYLE_FETCH_LIMIT = 100

function buildStyleFetchWhere(db, options = {}) {
  const _ = db.command
  const parts = []

  if (options.onlyEnabled !== false) {
    parts.push(_.or([{ enabled: true }, { enabled: _.exists(false) }]))
  }

  const genderWhere = buildStyleGenderDbWhere(db, options.gender)
  if (genderWhere) parts.push(genderWhere)

  if (!parts.length) return null
  return parts.length === 1 ? parts[0] : _.and(parts)
}

async function fetchStyleTemplates(db, options = {}) {
  const collection = options.collection || 'style_templates'
  const pageSize = options.limit || STYLE_FETCH_LIMIT
  const onlyEnabled = options.onlyEnabled !== false
  const where = buildStyleFetchWhere(db, options)

  const allRows = []
  let skip = 0
  while (true) {
    let query = db.collection(collection)
    if (where) query = query.where(where)
    const res = await query.skip(skip).limit(pageSize).get()
    const rows = res.data || []
    if (!rows.length) break
    allRows.push(...rows)
    skip += rows.length
    if (rows.length < pageSize) break
  }

  let list = allRows.map(normalizeStyle).filter((s) => s && s.id)
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

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = list[i]
    list[i] = list[j]
    list[j] = tmp
  }
  return list
}

/**
 * 拍摄选风格：9 张取排序前 9；3 张在无历史时随机，有历史时尽量避开已拍风格
 * @param {Array} pool 已按性别过滤且 sortStyles 后的列表
 * @param {3|9} count
 * @param {{ usedStyleIds?: string[], preferRandom?: boolean }} [options]
 */
function pickStylesForShoot(pool, count, options = {}) {
  const list = pool || []
  if (!list.length) return []

  const n = count === 9 ? 9 : 3
  if (n === 9) {
    return list.slice(0, Math.min(9, list.length))
  }

  const usedSet = new Set(
    (options.usedStyleIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  )
  const preferRandom = !!options.preferRandom || usedSet.size === 0

  if (preferRandom) {
    return shuffleInPlace(list.slice()).slice(0, Math.min(3, list.length))
  }

  const unused = list.filter((s) => !usedSet.has(s.id))
  if (unused.length >= 3) {
    return shuffleInPlace(unused.slice()).slice(0, 3)
  }

  const picked = unused.slice()
  const pickedIds = new Set(picked.map((s) => s.id))
  for (const style of list) {
    if (picked.length >= 3) break
    if (pickedIds.has(style.id)) continue
    picked.push(style)
    pickedIds.add(style.id)
  }
  return picked.slice(0, Math.min(3, list.length))
}

module.exports = {
  STYLE_FETCH_LIMIT,
  fetchStyleTemplates,
  fetchStylesByIds,
  pickStyles,
  pickStylesForShoot
}
