const { ensureStyleShowcasePage } = require('../../utils/styleShowcaseGuard')
const { fetchStyleTemplates } = require('../../../config/styles')

/** 无后台 desc 时的氛围副标题（可按风格名扩展） */
const STYLE_BLURBS = {
  机长照: '干练制服 · 商务肖像 · 专业光影',
  港风街拍: '胶片色调 · 都市光影 · 故事感肖像',
  法式复古: '柔光油画 · 浪漫慵懒 · 复古氛围',
  汉服古风: '东方韵味 · 古典妆造 · 意境人像',
  日系清新: '自然明亮 · 清透肤色 · 生活感',
  都市夜景: '霓虹氛围 · 轮廓光 · 电影感',
  森系文艺: '绿意自然 · 柔和色调 · 治愈感',
  黑白肖像: '高对比 · 经典光影 · 情绪表达',
  油画质感: '笔触感 · 艺术肖像 · 厚重色彩'
}

function blurbForTemplate(item, isStore) {
  const custom = (item.desc || item.description || item.subtitle || '').trim()
  if (custom) return custom
  const name = (item.name || '').trim()
  if (name && STYLE_BLURBS[name]) return STYLE_BLURBS[name]
  return isStore
    ? '拍摄选风格时可参考此样板效果'
    : '平台样板效果 · 到店拍摄由门店为您 AI 生成'
}

function enrichTemplates(list, isStore) {
  return (list || []).map((item) => {
    const cover = item.sampleDisplayUrl || item.sampleFileId || ''
    const heroCover =
      item.sampleHdDisplayUrl ||
      item.sampleHdFileId ||
      item.sampleDisplayUrl ||
      item.sampleFileId ||
      ''
    return {
      ...item,
      blurb: blurbForTemplate(item, isStore),
      cover,
      heroCover
    }
  })
}

function calcHeroHeightPx() {
  try {
    const info = wx.getWindowInfo()
    const wh = info.windowHeight || 667
    return Math.round(wh * 0.62)
  } catch (_) {
    return 440
  }
}

Page({
  behaviors: [require('../../behaviors/customerPageNav')],

  data: {
    templates: [],
    currentIndex: 0,
    thumbIntoView: '',
    loading: true,
    error: '',
    heroHeightPx: 440,
    footHint: ''
  },

  async onShow() {
    const { ok, isStore } = await ensureStyleShowcasePage()
    if (!ok) return
    const footHint = isStore
      ? '点击大图预览 · 拍摄时可选对应风格'
      : '点击大图全屏预览 · 到店由门店为您拍摄生成'
    this.setData({
      heroHeightPx: calcHeroHeightPx(),
      footHint
    })
    this._isStore = isStore
    this.loadTemplates()
  },

  async loadTemplates() {
    this.setData({ loading: true, error: '' })
    try {
      const db = wx.cloud.database()
      const raw = await fetchStyleTemplates(db)
      const templates = enrichTemplates(raw, !!this._isStore)
      this.setData({
        templates,
        loading: false,
        currentIndex: 0,
        thumbIntoView: templates.length ? 'thumb-0' : ''
      })
    } catch (e) {
      this.setData({
        loading: false,
        error: e.message || '加载失败',
        templates: []
      })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onSwiperChange(e) {
    const index = e.detail.current
    this.setData({
      currentIndex: index,
      thumbIntoView: `thumb-${index}`
    })
  },

  onThumbTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    if (Number.isNaN(index)) return
    this.setData({
      currentIndex: index,
      thumbIntoView: `thumb-${index}`
    })
  },

  onPreview(e) {
    const index =
      e.currentTarget.dataset.index != null
        ? Number(e.currentTarget.dataset.index)
        : this.data.currentIndex
    const urls = this.data.templates
      .map((t) => t.sampleHdDisplayUrl || t.sampleHdFileId || t.cover)
      .filter(Boolean)
    if (!urls.length) return
    wx.previewImage({
      urls,
      current: urls[index] || urls[0]
    })
  }
})
