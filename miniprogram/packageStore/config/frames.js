const { FRAME_POINTS } = require('../../utils/storePoints.js')

/** 摆台下单固定消耗积分（与 Excel 9.9 元/个 对齐：99 积分） */
const FRAME_ORDER_COST = FRAME_POINTS

function parseFrameCode(id) {
  const m = String(id || '').match(/^F(\d{1,2})$/i)
  return m ? Number(m[1]) : 9999
}

function buildSizeText(row) {
  if (row.sizeFirst != null && row.sizeSecond != null) {
    const u = row.sizeUnit || 'cm'
    return `${row.sizeFirst}${u} × ${row.sizeSecond}${u}`
  }
  return (row.size || '').trim()
}

function normalizeFrame(row) {
  if (!row) return null
  const coverFileId = String(
    row.coverFileId || row.coverUrl || ''
  ).trim()
  const size = buildSizeText(row)
  const material = (row.material || '').trim()
  const specParts = [size, material].filter(Boolean)
  return {
    _id: row._id || '',
    id: row.id,
    name: row.name || '',
    coverFileId,
    coverDisplayUrl: '',
    size,
    sizeFirst: row.sizeFirst,
    sizeSecond: row.sizeSecond,
    sizeUnit: row.sizeUnit || 'cm',
    material,
    specText: specParts.join(' / '),
    sort: row.sort != null ? row.sort : 0,
    enabled: row.enabled !== false
  }
}

/**
 * cloud:// 封面转 https 展示地址
 */
async function attachCoverDisplayUrls(frames) {
  if (!frames.length) return []
  const cloudIds = [
    ...new Set(
      frames
        .map((f) => f.coverFileId)
        .filter((id) => id && String(id).startsWith('cloud://'))
    )
  ]
  if (!cloudIds.length) {
    return frames.map((f) => ({
      ...f,
      coverDisplayUrl: f.coverFileId || ''
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
    return frames.map((f) => ({
      ...f,
      coverDisplayUrl: map[f.coverFileId] || f.coverFileId || ''
    }))
  } catch (e) {
    console.warn('[frames] getTempFileURL 失败', e)
    return frames.map((f) => ({
      ...f,
      coverDisplayUrl: f.coverFileId || ''
    }))
  }
}

/**
 * 从 frame_templates 拉取启用中的相框（与后台 admin 同一集合）
 */
async function fetchFrameTemplates(db, options = {}) {
  const collection = options.collection || 'frame_templates'
  const limit = options.limit || 50
  const onlyEnabled = options.onlyEnabled !== false

  const res = await db.collection(collection).limit(limit).get()
  let list = (res.data || []).map(normalizeFrame).filter((f) => f && f.id)
  if (onlyEnabled) {
    list = list.filter((f) => f.enabled)
  }
  list = sortFrames(list)
  return attachCoverDisplayUrls(list)
}

function sortFrames(list) {
  return list.slice().sort((a, b) => {
    const na = parseFrameCode(a.id)
    const nb = parseFrameCode(b.id)
    if (na !== nb) return na - nb
    const sa = Number(a.sort) || 0
    const sb = Number(b.sort) || 0
    if (sa !== sb) return sa - sb
    return String(a.id).localeCompare(String(b.id))
  })
}

module.exports = {
  FRAME_ORDER_COST,
  fetchFrameTemplates
}
