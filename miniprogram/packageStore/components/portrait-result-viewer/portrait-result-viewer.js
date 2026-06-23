const SWIPE_HINT_KEY = 'ai_portrait_swipe_hint_shown';
const { downloadCountText } = require('../../utils/portraitViewer/normalizeItems.js');
const { downloadAllItems, saveOneToAlbum } = require('../../utils/portraitViewer/downloadPhotos.js');
const { createPreviewGestureMethods } = require('../../utils/portraitViewer/previewGesture.js');
const previewGestureMethods = createPreviewGestureMethods();

function rpxToPx(rpx) {
  const sys = wx.getSystemInfoSync();
  return Math.round((rpx / 750) * sys.windowWidth);
}

function fitAspectRect(containerW, containerH, imageRatio) {
  let dw;
  let dh;
  let dx;
  let dy;
  if (containerW / containerH > imageRatio) {
    dh = containerH;
    dw = containerH * imageRatio;
    dx = (containerW - dw) / 2;
    dy = 0;
  } else {
    dw = containerW;
    dh = containerW / imageRatio;
    dx = 0;
    dy = (containerH - dh) / 2;
  }
  return { dw, dh, dx, dy };
}

const SLIDE_PROGRESS_HIDE_MS = 1500;

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
    },
    showBatchFavorite: {
      type: Boolean,
      value: false
    },
    batchFavorite: {
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
    showSlideProgress: false,
    slideProgressText: '',
    thumbScrollIntoView: '',
    previewVisible: false,
    previewIndex: 0,
    previewTransform: 'translate(0px, 0px) scale(1, 1)',
    previewTouchCapture: false,
    previewAnimClass: '',
    previewAnimating: false,
    previewProgressStyle: '',
    previewProgressHidden: false,
    previewBottomBarVisible: false,
    heroChromeTop: 10,
    heroChromeRight: 10
  },

  observers: {
    'results, currentIndex'(results, currentIndex) {
      const item = (results || [])[currentIndex];
      this.setData({
        currentItemFailed: item ? item.status === 'failed' : false,
        downloadCountText: downloadCountText(results),
        thumbScrollIntoView: results && results.length > 1 ? `thumb-${currentIndex}` : ''
      });
      wx.nextTick(() => {
        this.updateSwiperHeight();
      });
    },
    phase(val) {
      if (val === 'success') {
        wx.nextTick(() => this.updateSwiperHeight());
      }
    }
  },

  lifetimes: {
    attached() {
      this._initPreviewMetrics();
    },
    detached() {
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this.clearSlideProgressTimer();
      this._clearPreviewSingleTapTimer();
    }
  },

  methods: {
    ...previewGestureMethods,
    updateSwiperHeight(forIndex) {
      const index = forIndex != null ? forIndex : this.properties.currentIndex;
      const overlapPx = rpxToPx(48);
      const q = wx.createSelectorQuery().in(this);
      q.select('.content-scroll').boundingClientRect();
      q.select('.style-tray').boundingClientRect();
      q.exec((res) => {
        const scrollRect = res[0];
        const trayRect = res[1];
        if (!scrollRect || scrollRect.height <= 80) return;

        const trayH = trayRect?.height || rpxToPx(280);
        const maxH = scrollRect.height - trayH + overlapPx;
        const ratio = (this.properties.results || [])[index]?.aspectRatio;
        const cw = scrollRect.width;
        let frameH = maxH;
        if (ratio && cw > 0) {
          frameH = Math.min(maxH, cw / ratio);
        }

        const next = Math.max(80, Math.floor(frameH));
        if (next === this.data.swiperHeight) {
          this.computeHeroChromeLayout(index);
          return;
        }
        this.setData({ swiperHeight: next }, () => {
          wx.nextTick(() => this.computeHeroChromeLayout(index));
        });
      });
    },

    computeHeroChromeLayout(forIndex) {
      const index = forIndex != null ? forIndex : this.properties.currentIndex;
      const item = (this.properties.results || [])[index];
      const ratio = item?.aspectRatio;
      const pad = rpxToPx(20);

      wx.createSelectorQuery()
        .in(this)
        .select('.hero-frame')
        .boundingClientRect((rect) => {
          if (!rect || rect.width <= 0 || rect.height <= 0) return;
          if (!ratio) {
            this.setData({ heroChromeTop: pad, heroChromeRight: pad });
            return;
          }
          const { dx, dy } = fitAspectRect(rect.width, rect.height, ratio);
          this.setData({
            heroChromeTop: Math.round(dy + pad),
            heroChromeRight: Math.round(dx + pad)
          });
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

    revealSlideProgress(forIndex) {
      const results = this.properties.results || [];
      if (results.length <= 1) return;
      const index = forIndex != null ? forIndex : this.properties.currentIndex;
      const safeIndex = Math.max(0, Math.min(index, results.length - 1));
      this.clearSlideProgressTimer();
      this.setData({
        showSlideProgress: true,
        slideProgressText: `${safeIndex + 1}/${results.length}`
      });
    },

    scheduleHideSlideProgress() {
      this.clearSlideProgressTimer();
      this._slideProgressTimer = setTimeout(() => {
        this._slideProgressTimer = null;
        this.hideSlideProgress();
      }, SLIDE_PROGRESS_HIDE_MS);
    },

    clearSlideProgressTimer() {
      if (this._slideProgressTimer) {
        clearTimeout(this._slideProgressTimer);
        this._slideProgressTimer = null;
      }
    },

    hideSlideProgress() {
      this.clearSlideProgressTimer();
      if (!this.data.showSlideProgress) return;
      this.setData({ showSlideProgress: false });
    },

    onSwiperTransition() {
      this.revealSlideProgress();
    },

    onSwiperAnimationFinish() {
      this.scheduleHideSlideProgress();
    },

    onSwiperChange(e) {
      const index = Number(e.detail.current || 0);
      this.revealSlideProgress(index);
      this.notifyIndexChange(index);
      wx.nextTick(() => {
        this.updateSwiperHeight(index);
      });
    },

    onThumbTap(e) {
      const index = Number(e.currentTarget.dataset.index || 0);
      if (index === this.properties.currentIndex) return;
      this.revealSlideProgress(index);
      this.notifyIndexChange(index);
      this.scheduleHideSlideProgress();
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
      wx.nextTick(() => {
        this.updateSwiperHeight();
      });
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

      this._initPreviewMetrics();
      this._clearPreviewSingleTapTimer();
      this._lastPreviewTapAt = 0;
      this._resetPreviewTransformState();
      this.setData({
        previewVisible: true,
        previewIndex: index,
        previewTransform: 'translate(0px, 0px) scale(1, 1)',
        previewTouchCapture: false,
        previewAnimating: false,
        previewAnimClass: '',
        previewProgressStyle: '',
        previewProgressHidden: false,
        previewBottomBarVisible: true
      }, () => {
        wx.nextTick(() => this.updatePreviewProgressPos(index));
      });
    },

    onPreviewPhotoLoad(e) {
      const index = Number(e.currentTarget.dataset.index);
      const { width, height } = e.detail || {};
      if (width && height && !Number.isNaN(index)) {
        if (!this._previewPhotoDims) this._previewPhotoDims = {};
        this._previewPhotoDims[index] = { w: width, h: height };
        const aspectRatio = width / height;
        const updates = {};
        if (this.properties.results[index]?.aspectRatio !== aspectRatio) {
          updates[`results[${index}].aspectRatio`] = aspectRatio;
        }
        if (Object.keys(updates).length) {
          this.triggerEvent('patchresults', { updates });
        }
      }
      if (this.data.previewVisible && index === this.data.previewIndex) {
        wx.nextTick(() => this.updatePreviewProgressPos(index));
      }
    },

    onPreviewSwiperChange(e) {
      const nextIndex = Number(e.detail.current || 0);
      this._clearPreviewSingleTapTimer();
      this._hasMoved = true;
      this._gestureState = null;
      this._resetPreviewTransformState();
      this.setData({
        previewIndex: nextIndex,
        previewTouchCapture: false,
        previewAnimating: false,
        previewAnimClass: '',
        previewProgressHidden: false,
        previewTransform: 'translate(0px, 0px) scale(1, 1)'
      }, () => {
        wx.nextTick(() => this.updatePreviewProgressPos(nextIndex));
      });
    },

    onClosePreview() {
      this._clearPreviewSingleTapTimer();
      this._resetPreviewTransformState();
      this.setData({
        previewVisible: false,
        previewTouchCapture: false,
        previewAnimating: false,
        previewAnimClass: '',
        previewTransform: 'translate(0px, 0px) scale(1, 1)',
        previewProgressStyle: '',
        previewProgressHidden: false,
        previewBottomBarVisible: false
      });
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

    onToggleBatchFavorite() {
      this.triggerEvent('batchfavorite', { favorite: !this.properties.batchFavorite });
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
