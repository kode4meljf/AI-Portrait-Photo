const cloud = require('wx-server-sdk')
const { normalizeAlbumPlatformConfig } = require('./albumPlatformConfig')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTION = 'platform_settings'
const DOC_ID = 'default'

async function getSettingsForStore() {
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID).get()
    const raw = res.data || {}
    const phone = raw.supportPhone ? String(raw.supportPhone).trim() : ''
    const album = normalizeAlbumPlatformConfig(raw)
    return {
      supportPhone: phone,
      albumEntryMinTotal: album.albumEntryMinTotal,
      albumSelectMin: album.albumSelectMin,
      albumSelectMax: album.albumSelectMax,
      albumPointsPerPhoto: album.albumPointsPerPhoto
    }
  } catch (e) {
    const album = normalizeAlbumPlatformConfig({})
    return {
      supportPhone: '',
      albumEntryMinTotal: album.albumEntryMinTotal,
      albumSelectMin: album.albumSelectMin,
      albumSelectMax: album.albumSelectMax,
      albumPointsPerPhoto: album.albumPointsPerPhoto
    }
  }
}

module.exports = { getSettingsForStore }
