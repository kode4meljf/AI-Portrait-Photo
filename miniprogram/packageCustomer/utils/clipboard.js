const { ensurePrivacyAuthorized } = require('../../utils/privacy')

/**
 * 复制文本到剪贴板（先走微信隐私授权）
 * @param {string} text
 * @param {{ emptyToast?: string, successToast?: string, failToast?: string, privacyToast?: string }} [options]
 * @returns {Promise<boolean>}
 */
async function copyTextToClipboard(text, options = {}) {
  const data = String(text || '').trim()
  if (!data) {
    if (options.emptyToast) {
      wx.showToast({ title: options.emptyToast, icon: 'none' })
    }
    return false
  }
  try {
    await ensurePrivacyAuthorized()
  } catch (e) {
    wx.showToast({
      title: options.privacyToast || '需同意隐私政策后复制',
      icon: 'none'
    })
    return false
  }
  return new Promise((resolve) => {
    wx.setClipboardData({
      data,
      success: () => {
        if (options.successToast) {
          wx.showToast({ title: options.successToast, icon: 'success' })
        }
        resolve(true)
      },
      fail: () => {
        wx.showToast({
          title: options.failToast || '复制失败，请重试',
          icon: 'none'
        })
        resolve(false)
      }
    })
  })
}

module.exports = { copyTextToClipboard }
