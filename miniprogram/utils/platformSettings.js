/**
 * 平台配置（客服电话等），数据来自云库 platform_settings / default
 */

let cachedSupportPhone = null

function fetchPlatformSupportPhone(forceRefresh = false) {
  if (!forceRefresh && cachedSupportPhone !== null) {
    return Promise.resolve(cachedSupportPhone)
  }
  return wx.cloud
    .callFunction({
      name: 'storeMember',
      data: { action: 'platform.settings' }
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
