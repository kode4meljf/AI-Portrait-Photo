/** 邀请码 / 小程序码 / URL Link 对应打开的小程序版本 */
function getInviteEnvVersion() {
  try {
    const info = wx.getAccountInfoSync()
    const env = info.miniProgram && info.miniProgram.envVersion
    if (env === 'develop') return 'develop'
    if (env === 'trial') return 'trial'
  } catch (_) {
    /* ignore */
  }
  return 'release'
}

module.exports = { getInviteEnvVersion }
