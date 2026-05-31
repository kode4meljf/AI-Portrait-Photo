const SWIPE_HINT_KEY = 'ai_portrait_swipe_hint_shown';
const { downloadCountText } = require('../../utils/portraitViewer/normalizeItems.js');
const { downloadAllItems, saveOneToAlbum } = require('../../utils/portraitViewer/downloadPhotos.js');

const PREVIEW_ANIM_MS = 360;

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
    previewVisible: false,
    previewOpen: false,
    previewSettled: false,
    previewAnimating: false,
    previewIndex: 0,
    previewShellStyle: '',
    previewFallback: false,
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
      if (this._previewTimer) clearTimeout(this._previewTimer);
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
      if (this.data.previewVisible) return;
      this.triggerEvent('navback');
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

    preventMove() {},

    stopActionBubble() {},

    onPreviewImage(e) {
      const index = Number(e.currentTarget.dataset.index ?? this.properties.currentIndex);
      const item = this.properties.results[index];
      if (!item || item.status === 'failed' || item.status === 'retrying' || item.status === 'generating') {
        return;
      }

      const selector = `#hero-img-${index}`;
      wx.createSelectorQuery()
        .in(this)
        .select(selector)
        .boundingClientRect((rect) => {
          if (!rect || !rect.width) {
            this.openPreviewFallback(index);
            return;
          }
          this.openPreviewWithRect(index, rect);
        })
        .exec();
    },

    computePreviewTarget(rect, index) {
      const sys = wx.getWindowInfo();
      const ww = sys.windowWidth;
      const wh = sys.windowHeight;
      const bottomReserve = 140;
      const maxW = ww * 0.96;
      const maxH = wh - bottomReserve;

      let aspect = rect.width / rect.height;
      const item = this.properties.results[index];
      if (item && item.aspectRatio) {
        aspect = item.aspectRatio;
      } else if (!aspect || !Number.isFinite(aspect)) {
        aspect = 3 / 4;
      }

      let w = maxW;
      let h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }

      const left = (ww - w) / 2;
      const top = Math.max(0, (wh - h - bottomReserve) / 2);
      return { left, top, width: w, height: h };
    },

    buildShellStyle(target, tx, ty, scale) {
      return [
        `left:${target.left}px`,
        `top:${target.top}px`,
        `width:${target.width}px`,
        `height:${target.height}px`,
        `transform:translate(${tx}px,${ty}px) scale(${scale})`
      ].join(';');
    },

    clearPreviewTimer() {
      if (this._previewTimer) {
        clearTimeout(this._previewTimer);
        this._previewTimer = null;
      }
    },

    openPreviewWithRect(index, rect) {
      const target = this.computePreviewTarget(rect, index);
      const cx0 = rect.left + rect.width / 2;
      const cy0 = rect.top + rect.height / 2;
      const cx1 = target.left + target.width / 2;
      const cy1 = target.top + target.height / 2;
      const scale = Math.min(rect.width / target.width, rect.height / target.height);
      const tx = cx0 - cx1;
      const ty = cy0 - cy1;

      this.clearPreviewTimer();
      this.setData({
        previewVisible: true,
        previewOpen: false,
        previewSettled: false,
        previewAnimating: false,
        previewFallback: false,
        previewIndex: index,
        previewShellStyle: this.buildShellStyle(target, tx, ty, scale)
      });
      this.triggerEvent('previewchange', { visible: true });

      wx.nextTick(() => {
        this.setData({
          previewAnimating: true,
          previewOpen: true,
          previewShellStyle: this.buildShellStyle(target, 0, 0, 1)
        });
        this._previewTimer = setTimeout(() => {
          this.setData({ previewSettled: true, previewAnimating: false });
        }, PREVIEW_ANIM_MS);
      });
    },

    openPreviewFallback(index) {
      this.clearPreviewTimer();
      this.setData({
        previewVisible: true,
        previewOpen: true,
        previewSettled: true,
        previewAnimating: false,
        previewFallback: true,
        previewIndex: index,
        previewShellStyle: ''
      });
      this.triggerEvent('previewchange', { visible: true });
    },

    onPreviewSwiperChange(e) {
      const index = Number(e.detail.current || 0);
      if (!this.properties.results[index]) return;
      this.setData({ previewIndex: index });
      this.notifyIndexChange(index);
    },

    onClosePreview() {
      if (!this.data.previewVisible || this._closingPreview) return;

      if (this.data.previewFallback || !this.data.previewOpen) {
        this.resetPreview();
        return;
      }

      const index = this.data.previewIndex;
      wx.createSelectorQuery()
        .in(this)
        .select(`#hero-img-${index}`)
        .boundingClientRect((rect) => {
          if (!rect || !rect.width) {
            this.resetPreview();
            return;
          }
          this.closePreviewWithRect(index, rect);
        })
        .exec();
    },

    closePreviewWithRect(index, rect) {
      const target = this.computePreviewTarget(rect, index);
      const cx0 = rect.left + rect.width / 2;
      const cy0 = rect.top + rect.height / 2;
      const cx1 = target.left + target.width / 2;
      const cy1 = target.top + target.height / 2;
      const scale = Math.min(rect.width / target.width, rect.height / target.height);
      const tx = cx0 - cx1;
      const ty = cy0 - cy1;

      this._closingPreview = true;
      this.clearPreviewTimer();
      this.setData({
        previewSettled: false,
        previewOpen: false,
        previewAnimating: true,
        previewShellStyle: this.buildShellStyle(target, 0, 0, 1)
      });

      wx.nextTick(() => {
        this.setData({
          previewShellStyle: this.buildShellStyle(target, tx, ty, scale)
        });
      });

      this._previewTimer = setTimeout(() => {
        this._closingPreview = false;
        this.resetPreview();
      }, PREVIEW_ANIM_MS);
    },

    resetPreview() {
      this.clearPreviewTimer();
      this.setData({
        previewVisible: false,
        previewOpen: false,
        previewSettled: false,
        previewAnimating: false,
        previewFallback: false,
        previewShellStyle: ''
      });
      this.triggerEvent('previewchange', { visible: false });
    },

    onDownloadPreview() {
      const item = this.properties.results[this.data.previewIndex];
      if (!item || !item.url) {
        wx.showToast({ title: '暂无图片', icon: 'none' });
        return;
      }
      wx.showLoading({ title: '保存中' });
      saveOneToAlbum(item.url)
        .then(() => wx.showToast({ title: '已保存到相册', icon: 'success' }))
        .catch(() => wx.showToast({ title: '保存失败', icon: 'none' }))
        .finally(() => wx.hideLoading());
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
