function coverUrl(item) {
  if (!item) return ''
  return item.sampleDisplayUrl || item.sampleFileId || ''
}

function thumbCoverUrl(item) {
  if (!item) return ''
  const thumb = (item.sampleThumbDisplayUrl || item.sampleThumbFileId || '').trim()
  return thumb || coverUrl(item)
}

function normalizeList(templates) {
  return (templates || []).map((item, index) => {
    const cover = coverUrl(item)
    const thumbCover = thumbCoverUrl(item)
    const hasThumbAsset = thumbCover !== cover
    return {
      ...item,
      index,
      cover,
      thumbCover,
      /** 副格扁宽：竖版样图用 top 保留面部；有横图资源时用 aspectFill */
      thumbMode: hasThumbAsset ? 'aspectFill' : 'top'
    }
  })
}

Component({
  properties: {
    templates: {
      type: Array,
      value: [],
      observer: 'buildLayout'
    },
    title: {
      type: String,
      value: '风格样品'
    },
    moreText: {
      type: String,
      value: '查看全部 ›'
    }
  },

  data: {
    layout: 'empty',
    hero: null,
    subs: []
  },

  methods: {
    buildLayout() {
      const list = normalizeList(this.properties.templates)
      if (!list.length) {
        this.setData({ layout: 'empty', hero: null, subs: [] })
        return
      }
      if (list.length === 1) {
        this.setData({ layout: 'single', hero: list[0], subs: [] })
        return
      }
      this.setData({
        layout: 'feature',
        hero: list[0],
        subs: list.slice(1, 3)
      })
    },

    onMore() {
      this.triggerEvent('more')
    },

    onPreview(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (Number.isNaN(index)) return
      this.triggerEvent('preview', { index })
    }
  }
})
