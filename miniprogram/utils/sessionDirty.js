/**
 * launch 网关会话脏标记（方案一）
 * - true：下次进入 launch 需走 account.resolve（全屏加载 + 分流）
 * - false：身份未变，从子页返回 launch 可直接展示当前 status
 *
 * 身份可能变化时必须 markSessionDirty()，见各调用点注释。
 */

const LAUNCH_PATH = '/pages/launch/launch'

function getAppSafe() {
  try {
    return getApp()
  } catch (_) {
    return null
  }
}

function markSessionDirty(app) {
  const target = app || getAppSafe()
  if (target) target.globalData.sessionDirty = true
}

function clearSessionDirty(app) {
  const target = app || getAppSafe()
  if (target) target.globalData.sessionDirty = false
}

function isSessionDirty(app) {
  const target = app || getAppSafe()
  return !!(target && target.globalData.sessionDirty)
}

/** 会话失效或需重新分流时跳转 launch（自动置脏） */
function reLaunchLaunch(options = {}) {
  markSessionDirty()
  wx.reLaunch({ url: LAUNCH_PATH, ...options })
}

module.exports = {
  LAUNCH_PATH,
  markSessionDirty,
  clearSessionDirty,
  isSessionDirty,
  reLaunchLaunch
}
