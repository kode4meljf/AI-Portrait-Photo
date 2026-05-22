/**
 * 真机页面布局审计：检测主容器高度塌缩（常见于 scroll-view + flex + height:0）
 * @see miniprogram/docs/page-layout-realdevice.md
 */

const REPORT_KEY = 'PAGE_LAYOUT_ISSUES'
const MIN_VISIBLE_HEIGHT_PX = 80
const MAX_REPORTS = 30

/**
 * @param {WechatMiniprogram.Page.TrivialInstance} pageInstance
 * @param {{ pageRoute?: string, selectors?: string[], warnToast?: boolean }} [options]
 */
function auditPageLayout(pageInstance, options = {}) {
  if (!pageInstance) return

  const route = options.pageRoute || pageInstance.route || 'unknown'
  const selectors = options.selectors && options.selectors.length
    ? options.selectors
    : ['.page-root']

  wx.nextTick(() => {
    const query = wx.createSelectorQuery().in(pageInstance)
    selectors.forEach((sel) => query.select(sel).boundingClientRect())
    query.exec((rects) => {
      if (!Array.isArray(rects)) return

      const issues = []
      rects.forEach((rect, index) => {
        const selector = selectors[index]
        if (!rect) {
          issues.push({ selector, problem: 'not_found' })
          return
        }
        if (rect.height < MIN_VISIBLE_HEIGHT_PX) {
          issues.push({
            selector,
            problem: 'zero_or_tiny_height',
            height: rect.height,
            width: rect.width
          })
        }
      })

      if (!issues.length) return

      const payload = {
        route,
        issues,
        ts: Date.now(),
        device: typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : {}
      }

      console.error('[pageLayoutGuard] 页面主区域高度异常，真机可能白屏', payload)
      appendReport(payload)

      if (options.warnToast) {
        wx.showToast({ title: '页面布局异常', icon: 'none' })
      }
    })
  })
}

function appendReport(payload) {
  try {
    const prev = wx.getStorageSync(REPORT_KEY)
    const list = Array.isArray(prev) ? prev : []
    list.unshift(payload)
    wx.setStorageSync(REPORT_KEY, list.slice(0, MAX_REPORTS))
  } catch (e) {
    console.warn('[pageLayoutGuard] 无法写入本地报告', e)
  }
}

function getLayoutIssueReports() {
  try {
    const list = wx.getStorageSync(REPORT_KEY)
    return Array.isArray(list) ? list : []
  } catch (_) {
    return []
  }
}

function clearLayoutIssueReports() {
  try {
    wx.removeStorageSync(REPORT_KEY)
  } catch (_) {}
}

module.exports = {
  auditPageLayout,
  getLayoutIssueReports,
  clearLayoutIssueReports,
  REPORT_KEY,
  MIN_VISIBLE_HEIGHT_PX
}
