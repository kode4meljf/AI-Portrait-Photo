const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTION = 'platform_settings'
const DOC_ID = 'default'

async function getSettingsForStore() {
  try {
    const res = await db.collection(COLLECTION).doc(DOC_ID).get()
    const phone = (res.data && res.data.supportPhone) ? String(res.data.supportPhone).trim() : ''
    return { supportPhone: phone }
  } catch (e) {
    return { supportPhone: '' }
  }
}

module.exports = { getSettingsForStore }
