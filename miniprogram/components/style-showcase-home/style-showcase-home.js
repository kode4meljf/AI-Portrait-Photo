function coverUrl(item) {
  if (!item) return ''
  return item.sampleDisplayUrl || item.sampleFileId || ''
}

function normalizeList(templates) {
  return (templates || []).map((item, index) => ({
    ...item,
    index,
    cover: coverUrl(item)
  }))
}

Component({
  properties: {
    templates: {
      type: Array,
      value: [],
      observer: 'buildItems'
    },
    title: {
      type: String,
      value: '风格样品'
    },
    loading: {
      type: Boolean,
      value: false
    },
    loadingMore: {
      type: Boolean,
      value: false
    },
    hasMore: {
      type: Boolean,
      value: false
    }
  },

  data: {
    items: []
  },

  methods: {
    buildItems() {
      this.setData({ items: normalizeList(this.properties.templates) })
    },

    onPreview(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (Number.isNaN(index)) return
      this.triggerEvent('preview', { index })
    }
  }
})
