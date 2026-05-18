/** 摆台下单固定消耗点数（不写库） */
const FRAME_ORDER_COST = 20

const LOCAL_COVERS = [
  '/assets/frames/frame-f01-flamingo.png',
  '/assets/frames/frame-f02-sheep.png',
  '/assets/frames/frame-f03-wedding.png'
]

const DEFAULT_FRAMES = [
  {
    id: 'F01',
    name: '原木火烈鸟',
    coverFileId: LOCAL_COVERS[0],
    sizeFirst: 20,
    sizeSecond: 25,
    sizeUnit: 'cm',
    material: '原木'
  },
  {
    id: 'F02',
    name: '黑色小羊',
    coverFileId: LOCAL_COVERS[1],
    sizeFirst: 20,
    sizeSecond: 25,
    sizeUnit: 'cm',
    material: '金属'
  },
  {
    id: 'F03',
    name: '简约婚纱',
    coverFileId: LOCAL_COVERS[2],
    sizeFirst: 20,
    sizeSecond: 30,
    sizeUnit: 'cm',
    material: '亚克力'
  }
]

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
  DEFAULT_FRAMES: DEFAULT_FRAMES.map(normalizeFrame),
  normalizeFrame,
  sortFrames,
  attachCoverDisplayUrls,
  fetchFrameTemplates
}
