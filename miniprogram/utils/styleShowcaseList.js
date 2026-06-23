/** 首页风格样板：双列分页展示（每页 6 个） */

const { fetchShowcaseStyleTemplates } = require('../config/styles')

const PAGE_SIZE = 6
const FETCH_MAX = 100

function applyShowcaseSlice(page) {
  const pool = page._stylePool || []
  const next = Math.min((page._styleShown || 0) + PAGE_SIZE, pool.length)
  page._styleShown = next
  page.setData({
    templates: pool.slice(0, next),
    templatesHasMore: next < pool.length,
    templatesLoadingMore: false
  })
}

async function initShowcaseTemplates(page, db, options = {}) {
  if (page._showcaseLoading) return
  page._showcaseLoading = true
  page._showcaseReady = false
  page.setData({ templatesLoading: true })
  try {
    const pool = await fetchShowcaseStyleTemplates(db, {
      ...options,
      limit: options.limit || FETCH_MAX
    })
    page._stylePool = pool
    page._styleShown = 0
    applyShowcaseSlice(page)
  } catch (e) {
    console.error('[showcase] init', e)
    page._stylePool = []
    page._styleShown = 0
    page.setData({
      templates: [],
      templatesHasMore: false
    })
  } finally {
    page._showcaseLoading = false
    page._showcaseReady = true
    page.setData({ templatesLoading: false })
  }
}

function loadMoreShowcaseTemplates(page) {
  if (
    !page._showcaseReady ||
    page._showcaseLoading ||
    page.data.templatesLoadingMore ||
    !page.data.templatesHasMore
  ) {
    return
  }
  page.setData({ templatesLoadingMore: true })
  setTimeout(() => applyShowcaseSlice(page), 80)
}

module.exports = {
  PAGE_SIZE,
  initShowcaseTemplates,
  loadMoreShowcaseTemplates
}
