/**
 * 安全页面跳转，避免并发 navigate 触发 webview 路由异常
 */

let navigating = false

function safeNavigateTo(options = {}) {
  if (navigating) return
  navigating = true
  const { url, success, fail, complete, ...rest } = options
  wx.navigateTo({
    ...rest,
    url,
    success: (res) => {
      if (typeof success === 'function') success(res)
    },
    fail: (err) => {
      if (typeof fail === 'function') fail(err)
    },
    complete: (res) => {
      navigating = false
      if (typeof complete === 'function') complete(res)
    }
  })
}

function safeNavigateBack(options = {}) {
  const pages = getCurrentPages()
  if (pages.length <= 1) return
  wx.navigateBack({
    delta: options.delta || 1,
    fail: options.fail || (() => {}),
    success: options.success,
    complete: options.complete
  })
}

module.exports = {
  safeNavigateTo,
  safeNavigateBack
}
