/**
 * 平台配置（客服电话等），数据来自云库 platform_settings / default
 */

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

function fetchPlatformSupportPhone(forceRefresh = false) {
  if (!forceRefresh && cachedSupportPhone !== null) {
    return Promise.resolve(cachedSupportPhone)
  }
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
      const phone = (result.data && result.data.supportPhone)
        ? String(result.data.supportPhone).trim()
        : ''
      cachedSupportPhone = phone
      return phone
    })
    .catch((err) => {
      console.error('fetchPlatformSupportPhone', err)
      return ''
    })
}

function clearPlatformSettingsCache() {
  cachedSupportPhone = null
}

module.exports = {
  fetchPlatformSupportPhone,
  clearPlatformSettingsCache
}
