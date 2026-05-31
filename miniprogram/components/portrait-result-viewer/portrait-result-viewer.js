const SWIPE_HINT_KEY = 'ai_portrait_swipe_hint_shown';
const { downloadCountText } = require('../../utils/portraitViewer/normalizeItems.js');
const { downloadAllItems } = require('../../utils/portraitViewer/downloadPhotos.js');

Component({
  properties: {
    phase: {
      type: String,
      value: 'loading'
    },
    originalUrl: {
      type: String,
      value: ''
    },
    results: {
      type: Array,
      value: []
    },
    currentIndex: {
      type: Number,
      value: 0
    },
    loadingProgressText: {
      type: String,
      value: ''
    },
    statusBarHeight: {
      type: Number,
      value: 20
    },
    navTitle: {
      type: String,
      value: ''
    },
    showLoadingGalleryLink: {
      type: Boolean,
      value: false
    }
  },

  data: {
    swiperHeight: 420,
    showOriginFloat: false,
    showSwipeToast: false,
    currentItemFailed: false,
    downloadCountText: '',
    thumbScrollIntoView: ''
  },

  observers: {
    'results, currentIndex'(results, currentIndex) {
      const item = (results || [])[currentIndex];
      this.setData({
        currentItemFailed: item ? item.status === 'failed' : false,
        downloadCountText: downloadCountText(results),
        thumbScrollIntoView: results && results.length > 1 ? `thumb-${currentIndex}` : ''
      });
    },
    phase(val) {
      if (val === 'success') {
        wx.nextTick(() => this.updateSwiperHeight());
      }
    }
  },

  lifetimes: {
    detached() {
      if (this._toastTimer) clearTimeout(this._toastTimer);
    }
  },

  methods: {
    updateSwiperHeight() {
      wx.createSelectorQuery()
        .in(this)
        .select('.hero-stage')
        .boundingClientRect((rect) => {
          if (rect && rect.height > 80) {
            this.setData({ swiperHeight: Math.floor(rect.height) });
          }
        })
        .exec();
    },

    maybeShowSwipeToast(count) {
      if (count <= 1) return;
      if (wx.getStorageSync(SWIPE_HINT_KEY)) return;
      wx.setStorageSync(SWIPE_HINT_KEY, '1');
      this.setData({ showSwipeToast: true });
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.setData({ showSwipeToast: false });
      }, 3000);
    },

    notifyIndexChange(index) {
      const item = (this.properties.results || [])[index];
      this.triggerEvent('indexchange', {
        index,
        styleName: item ? item.name || '' : ''
      });
    },

    onNavBack() {
      this.triggerEvent('navback');
    },

    isPreviewableItem(item) {
      return (
        item &&
        item.url &&
        item.status !== 'failed' &&
        item.status !== 'retrying' &&
        item.status !== 'generating'
      );
    },

    collectPreviewUrls() {
      return (this.properties.results || [])
        .filter((item) => this.isPreviewableItem(item))
        .map((item) => String(item.url).trim())
        .filter(Boolean);
    },

    onSwiperChange(e) {
      const index = Number(e.detail.current || 0);
      this.notifyIndexChange(index);
    },

    onThumbTap(e) {
      const index = Number(e.currentTarget.dataset.index || 0);
      this.notifyIndexChange(index);
    },

    onResultImageLoad(e) {
      const index = Number(e.currentTarget.dataset.index);
      const { width, height } = e.detail || {};
      if (!width || !height || Number.isNaN(index)) return;
      const imageMode = width >= height ? 'landscape' : 'portrait';
      const aspectRatio = width / height;
      const updates = {};
      if (this.properties.results[index]?.imageMode !== imageMode) {
        updates[`results[${index}].imageMode`] = imageMode;
      }
      if (this.properties.results[index]?.aspectRatio !== aspectRatio) {
        updates[`results[${index}].aspectRatio`] = aspectRatio;
      }
      if (Object.keys(updates).length) {
        this.triggerEvent('patchresults', { updates });
      }
    },

    onToggleOrigin() {
      this.setData({ showOriginFloat: !this.data.showOriginFloat });
    },

    onPreviewOriginal() {
      const url = String(this.properties.originalUrl || '').trim();
      if (!url) {
        wx.showToast({ title: '暂无原图', icon: 'none' });
        return;
      }
      wx.previewImage({ urls: [url], current: url });
    },

    onPreviewImage(e) {
      const index = Number(e.currentTarget.dataset.index ?? this.properties.currentIndex);
      const item = (this.properties.results || [])[index];
      if (!this.isPreviewableItem(item)) return;

      const current = String(item.url).trim();
      const urls = this.collectPreviewUrls();
      if (!urls.length) {
        wx.showToast({ title: '暂无图片', icon: 'none' });
        return;
      }

      wx.previewImage({
        urls,
        current: urls.includes(current) ? current : urls[0]
      });
    },

    onDownloadAll() {
      downloadAllItems(this.properties.results);
    },

    onOpenGallery() {
      this.triggerEvent('opengallery');
    },

    onRetryTap(e) {
      const index = Number(e.currentTarget.dataset.index ?? this.properties.currentIndex);
      this.triggerEvent('retry', { index });
    },

    onMakeAlbum() {
      this.triggerEvent('makealbum', { index: this.properties.currentIndex });
    },

    onMakeFrame() {
      const item = this.properties.results[this.properties.currentIndex];
      if (!item || item.status === 'failed' || item.status === 'retrying' || item.status === 'generating') {
        wx.showToast({ title: '当前风格未生成成功', icon: 'none' });
        return;
      }
      this.triggerEvent('makeframe', { index: this.properties.currentIndex, item });
    },

    afterSuccessReady() {
      wx.nextTick(() => {
        this.updateSwiperHeight();
        this.maybeShowSwipeToast((this.properties.results || []).length);
      });
    }
  }
});
