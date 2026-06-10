/** 制作影集：平台可配置阈值（platform_settings / default） */

const DEFAULT_ALBUM_ENTRY_MIN_TOTAL = 40
const DEFAULT_ALBUM_SELECT_MIN = 30
const DEFAULT_ALBUM_SELECT_MAX = 40
const DEFAULT_ALBUM_POINTS_PER_PHOTO = 23

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeAlbumPlatformConfig(raw = {}) {
  const selectMin = clampInt(raw.albumSelectMin, DEFAULT_ALBUM_SELECT_MIN, 1, 200)
  let selectMax = clampInt(raw.albumSelectMax, DEFAULT_ALBUM_SELECT_MAX, selectMin, 200)
  if (selectMax < selectMin) selectMax = selectMin
  const entryMin = clampInt(
    raw.albumEntryMinTotal,
    DEFAULT_ALBUM_ENTRY_MIN_TOTAL,
    selectMax,
    500
  )
  const pointsPerPhoto = clampInt(
    raw.albumPointsPerPhoto,
    DEFAULT_ALBUM_POINTS_PER_PHOTO,
    1,
    999
  )
  return {
    albumEntryMinTotal: entryMin,
    albumSelectMin: selectMin,
    albumSelectMax: selectMax,
    albumPointsPerPhoto: pointsPerPhoto
  }
}

function validateAlbumPlatformConfigPayload(payload = {}) {
  const next = normalizeAlbumPlatformConfig({
    albumSelectMin:
      payload.albumSelectMin != null && payload.albumSelectMin !== ''
        ? payload.albumSelectMin
        : DEFAULT_ALBUM_SELECT_MIN,
    albumSelectMax:
      payload.albumSelectMax != null && payload.albumSelectMax !== ''
        ? payload.albumSelectMax
        : DEFAULT_ALBUM_SELECT_MAX,
    albumEntryMinTotal:
      payload.albumEntryMinTotal != null && payload.albumEntryMinTotal !== ''
        ? payload.albumEntryMinTotal
        : DEFAULT_ALBUM_ENTRY_MIN_TOTAL,
    albumPointsPerPhoto:
      payload.albumPointsPerPhoto != null && payload.albumPointsPerPhoto !== ''
        ? payload.albumPointsPerPhoto
        : DEFAULT_ALBUM_POINTS_PER_PHOTO
  })
  if (next.albumSelectMin > next.albumSelectMax) {
    throw new Error('影集最少选图张数不能大于最多选图张数')
  }
  if (next.albumEntryMinTotal < next.albumSelectMax) {
    throw new Error('影集准入张数不能小于最多选图张数')
  }
  return next
}

const PLATFORM_SETTINGS_COL = 'platform_settings'
const PLATFORM_SETTINGS_ID = 'default'

async function readAlbumPlatformConfig(db) {
  try {
    const res = await db.collection(PLATFORM_SETTINGS_COL).doc(PLATFORM_SETTINGS_ID).get()
    return normalizeAlbumPlatformConfig(res.data || {})
  } catch (e) {
    return normalizeAlbumPlatformConfig({})
  }
}

module.exports = {
  DEFAULT_ALBUM_ENTRY_MIN_TOTAL,
  DEFAULT_ALBUM_SELECT_MIN,
  DEFAULT_ALBUM_SELECT_MAX,
  DEFAULT_ALBUM_POINTS_PER_PHOTO,
  normalizeAlbumPlatformConfig,
  validateAlbumPlatformConfigPayload,
  readAlbumPlatformConfig
}
