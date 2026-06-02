const SWIPE_HINT_KEY = 'ai_portrait_swipe_hint_shown';
const { downloadCountText } = require('../../utils/portraitViewer/normalizeItems.js');
const { downloadAllItems, saveOneToAlbum } = require('../../utils/portraitViewer/downloadPhotos.js');

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
    thumbScrollIntoView: '',
    previewVisible: false,
    previewIndex: 0,
    previewScale: 1,
    previewSwiperLock: false
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
      this._lastPreviewTapAt = 0;
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

    resetPreviewGestures() {
      this._lastPreviewTapAt = 0;
      this.setData({
        previewScale: 1,
        previewSwiperLock: false
      });
    },

    onPreviewImage(e) {
      const index = Number(e.currentTarget.dataset.index ?? this.properties.currentIndex);
      const item = (this.properties.results || [])[index];
      if (!this.isPreviewableItem(item)) return;

      this.resetPreviewGestures();
      this.setData({
        previewVisible: true,
        previewIndex: index
      });
    },

    onPreviewSwiperChange(e) {
      this.resetPreviewGestures();
      this.setData({ previewIndex: Number(e.detail.current || 0) });
    },

    onPreviewScale(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (index !== this.data.previewIndex) return;
      const scale = Number(e.detail.scale) || 1;
      this.setData({
        previewScale: scale,
        previewSwiperLock: scale > 1.02
      });
    },

    onPreviewImageTap(e) {
      const index = Number(e.currentTarget.dataset.index);
      if (index !== this.data.previewIndex) return;
      const now = Date.now();
      if (now - (this._lastPreviewTapAt || 0) < 280) {
        const nextScale = this.data.previewScale > 1.05 ? 1 : 2.5;
        this.setData({
          previewScale: nextScale,
          previewSwiperLock: nextScale > 1.02
        });
        this._lastPreviewTapAt = 0;
        return;
      }
      this._lastPreviewTapAt = now;
    },

    onPreviewTouchStart(e) {
      if (this.data.previewScale > 1.02) return;
      const touch = e.touches && e.touches[0];
      this._previewTouchStartY = touch ? touch.clientY : 0;
    },

    onPreviewTouchEnd(e) {
      if (this.data.previewScale > 1.02) return;
      const touch = e.changedTouches && e.changedTouches[0];
      if (!touch || this._previewTouchStartY == null) return;
      const dy = touch.clientY - this._previewTouchStartY;
      this._previewTouchStartY = null;
      if (dy > 90) {
        this.onClosePreview();
      }
    },

    onClosePreview() {
      this.resetPreviewGestures();
      this.setData({ previewVisible: false });
    },

    stopActionBubble() {},

    preventMove() {},

    async onDownloadPreview() {
      const item = (this.properties.results || [])[this.data.previewIndex];
      if (!this.isPreviewableItem(item)) {
        wx.showToast({ title: '当前图片不可下载', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '保存中...', mask: true });
      try {
        await saveOneToAlbum(item.url);
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      } catch (err) {
        console.error('[portrait-result-viewer] download preview', err);
        const msg = (err && err.errMsg) || '';
        if (/auth deny|authorize|permission/i.test(msg)) {
          wx.showToast({ title: '请授权相册权限', icon: 'none' });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      } finally {
        wx.hideLoading();
      }
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
