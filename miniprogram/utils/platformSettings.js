/**
 * 平台配置（客服电话、影集阈值等），数据来自云库 platform_settings / default
 */

const { normalizeAlbumPlatformConfig, DEFAULTS } = require('./albumPlatformConfig')

let cachedSupportPhone = null

function getSettingsCloudTarget() {
  try {
    const app = getApp()
    if (app.globalData.accountKind === 'customer') {
      return { name: 'customer', action: 'platform.settings' }
    }
  } catch (e) {
    /* ignore */
  }
  return { name: 'storeMember', action: 'platform.settings' }
}

function callPlatformSettings() {
  const target = getSettingsCloudTarget()
  return wx.cloud
    .callFunction({
      name: target.name,
      data: { action: target.action }
    })
    .then((res) => {
      const result = res.result || {}
      if (!result.success) {
        throw new Error(result.error || '读取平台配置失败')
      }
      return result.data || {}
    })
}

function fetchPlatformSupportPhone(forceRefresh = false) {
  if (!forceRefresh && cachedSupportPhone !== null) {
    return Promise.resolve(cachedSupportPhone)
  }
  return callPlatformSettings()
    .then((data) => {
      const phone = data.supportPhone ? String(data.supportPhone).trim() : ''
      cachedSupportPhone = phone
      return phone
    })
    .catch((err) => {
      console.error('fetchPlatformSupportPhone', err)
      return ''
    })
}

/** 影集阈值仅制作影集流程使用，每次直读云端，不缓存 */
function fetchAlbumPlatformConfig() {
  return callPlatformSettings()
    .then((data) => normalizeAlbumPlatformConfig(data))
    .catch((err) => {
      console.error('fetchAlbumPlatformConfig', err)
      return { ...DEFAULTS }
    })
}

function clearPlatformSettingsCache() {
  cachedSupportPhone = null
}

module.exports = {
  fetchPlatformSupportPhone,
  fetchAlbumPlatformConfig,
  clearPlatformSettingsCache
}
