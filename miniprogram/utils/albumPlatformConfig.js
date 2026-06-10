const {
  ALBUM_ENTRY_MIN_TOTAL,
  ALBUM_SELECT_MIN,
  ALBUM_SELECT_MAX,
  ALBUM_POINTS_PER_PHOTO
} = require('./albumConstants')

const DEFAULTS = {
  albumEntryMinTotal: ALBUM_ENTRY_MIN_TOTAL,
  albumSelectMin: ALBUM_SELECT_MIN,
  albumSelectMax: ALBUM_SELECT_MAX,
  albumPointsPerPhoto: ALBUM_POINTS_PER_PHOTO
}

function clampInt(value, fallback, min, max) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeAlbumPlatformConfig(raw = {}) {
  const selectMin = clampInt(raw.albumSelectMin, DEFAULTS.albumSelectMin, 1, 200)
  let selectMax = clampInt(raw.albumSelectMax, DEFAULTS.albumSelectMax, selectMin, 200)
  if (selectMax < selectMin) selectMax = selectMin
  const entryMin = clampInt(
    raw.albumEntryMinTotal,
    DEFAULTS.albumEntryMinTotal,
    selectMax,
    500
  )
  const pointsPerPhoto = clampInt(
    raw.albumPointsPerPhoto,
    DEFAULTS.albumPointsPerPhoto,
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

module.exports = {
  DEFAULTS,
  normalizeAlbumPlatformConfig
}
