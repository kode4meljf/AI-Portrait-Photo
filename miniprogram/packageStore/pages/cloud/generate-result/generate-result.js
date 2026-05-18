const SWIPE_HINT_KEY = 'ai_portrait_swipe_hint_shown';
const { fetchStylesByIds, pickStyles } = require('../../../../config/styles.js');
const { STYLE_TEMPLATES_COLLECTION } = require('../../../../config/constants.js');
const { pickRandomCloudPhotoFileId, isCloudFileId } = require('../../../../utils/cloudPhoto.js');
const db = wx.cloud.database();

const PREVIEW_ANIM_MS = 360;

Page({
  data: {
    phase: 'loading',
    originalUrl: '',
    styles: [],
    results: [],
    currentIndex: 0,
    progressText: '',
    swiperHeight: 420,
    showOriginFloat: false,
    showProgressBadge: false,
    showSwipeToast: false,
    previewVisible: false,
    previewExpanded: false,
    previewAnimating: false,
    previewIndex: 0,
    previewCurrentUrl: '',
    previewFlyStyle: '',
    statusBarHeight: 20,
    navTitle: '生成中'
  },

  onLoad(options) {
    const sys = wx.getWindowInfo();
    this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    const originalUrl = decodeURIComponent(options.originalUrl || '');
    const count = Number(options.count || 3) === 9 ? 9 : 3;
    const styleIds = `${options.styleIds || ''}`.split(',').filter(Boolean);
    this.setData({ originalUrl });
    this.updateNavBar('loading');
    this.resolveStyles(styleIds, count)
      .then((styles) => {
        this.setData({ styles });
        this.runGeneration();
      })
      .catch((err) => {
        console.error('[generate-result] 风格加载失败', err);
        wx.showToast({ title: '风格加载失败', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      });
  },

  async resolveStyles(styleIds, count) {
    const list = await fetchStylesByIds(db, styleIds, {
      collection: STYLE_TEMPLATES_COLLECTION,
      limit: 20,
      onlyEnabled: true
    })
    if (!list.length) {
      throw new Error('未获取到风格模板')
    }
    if (styleIds.length) {
      return list
    }
    return pickStyles(list, count)
  },

  onReady() {
    if (this.data.phase === 'success') {
      this.updateSwiperHeight();
    }
  },

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

  updateNavBar(phase) {
    const navTitle = phase === 'loading' ? '生成中' : '生成结果';
    this.setData({ navTitle });
  },

  onNavBack() {
    if (this.data.previewVisible) return;
    wx.navigateBack();
  },

  async runGeneration() {
    try {
      const results = await this.callGenerateApi();
      const progressText = results.length ? `1 / ${results.length}` : '';
      const firstName = results[0]?.name || '';
      this.setData({
        phase: 'success',
        results,
        currentIndex: 0,
        currentStyleName: firstName,
        progressText
      });
      this.updateNavBar('success');
      wx.nextTick(() => {
        this.updateSwiperHeight();
        this.maybeShowSwipeToast(results.length);
      });
    } catch (err) {
      console.error('[generate-result] 生成失败', err);
      wx.showToast({
        title: (err && err.message) || '生成失败',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  callGenerateApi() {
    const { originalUrl, styles } = this.data;
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (!originalUrl && !styles.length) {
          reject(new Error('缺少原图或风格信息'));
          return;
        }
        const results = styles.map((style, i) => ({
          id: style.id,
          name: style.name,
          url: originalUrl || style.sampleFileId,
          imageMode: 'portrait',
          aspectRatio: i % 2 === 0 ? 3 / 4 : 16 / 9
        }));
        resolve(results);
      }, 2500);
    });
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

  onSwiperChange(e) {
    const index = Number(e.detail.current || 0);
    this.syncCurrentIndex(index);
  },

  onSwiperTransition() {
    if (this.data.results.length <= 1) return;
    if (this._badgeHideTimer) {
      clearTimeout(this._badgeHideTimer);
      this._badgeHideTimer = null;
    }
    if (!this.data.showProgressBadge) {
      this.setData({ showProgressBadge: true });
    }
  },

  onSwiperAnimationFinish() {
    if (this.data.results.length <= 1) return;
    if (this._badgeHideTimer) clearTimeout(this._badgeHideTimer);
    this._badgeHideTimer = setTimeout(() => {
      this.setData({ showProgressBadge: false });
      this._badgeHideTimer = null;
    }, 350);
  },

  syncCurrentIndex(index) {
    const item = this.data.results[index];
    if (!item) return;
    this.setData({
      currentIndex: index,
      progressText: `${index + 1} / ${this.data.results.length}`
    });
  },

  onResultImageLoad(e) {
    const index = Number(e.currentTarget.dataset.index);
    const { width, height } = e.detail || {};
    if (!width || !height || Number.isNaN(index)) return;
    const imageMode = width >= height ? 'landscape' : 'portrait';
    const aspectRatio = width / height;
    const updates = {};
    if (this.data.results[index]?.imageMode !== imageMode) {
      updates[`results[${index}].imageMode`] = imageMode;
    }
    if (this.data.results[index]?.aspectRatio !== aspectRatio) {
      updates[`results[${index}].aspectRatio`] = aspectRatio;
    }
    if (Object.keys(updates).length) {
      this.setData(updates);
    }
  },

  onToggleOrigin() {
    this.setData({ showOriginFloat: !this.data.showOriginFloat });
  },

  preventMove() {},

  stopActionBubble() {},

  onPreviewImage(e) {
    const index = Number(e.currentTarget.dataset.index ?? this.data.currentIndex);
    const item = this.data.results[index];
    if (!item) return;

    const selector = `#hero-img-${index}`;
    wx.createSelectorQuery()
      .in(this)
      .select(selector)
      .boundingClientRect((rect) => {
        if (!rect || !rect.width) {
          this.openPreviewFallback(index, item.url);
          return;
        }
        this.openPreviewWithRect(index, item.url, rect);
      })
      .exec();
  },

  computePreviewTarget(rect) {
    const sys = wx.getWindowInfo();
    const ww = sys.windowWidth;
    const wh = sys.windowHeight;
    const bottomReserve = 140;
    const maxW = ww * 0.96;
    const maxH = wh - bottomReserve;

    let aspect = rect.width / rect.height;
    const item = this.data.results[this.data.previewIndex];
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
    return { ww, wh, left, top, width: w, height: h };
  },

  buildFlyStyle(target, tx, ty, scale) {
    return [
      `left:${target.left}px`,
      `top:${target.top}px`,
      `width:${target.width}px`,
      `height:${target.height}px`,
      `--tx:${tx}px`,
      `--ty:${ty}px`,
      `--scale:${scale}`
    ].join(';');
  },

  openPreviewWithRect(index, url, rect) {
    const target = this.computePreviewTarget(rect);
    const cx0 = rect.left + rect.width / 2;
    const cy0 = rect.top + rect.height / 2;
    const cx1 = target.left + target.width / 2;
    const cy1 = target.top + target.height / 2;
    const scale = Math.min(rect.width / target.width, rect.height / target.height);
    const tx = cx0 - cx1;
    const ty = cy0 - cy1;

    this.setData({
      previewVisible: true,
      previewExpanded: false,
      previewAnimating: false,
      previewIndex: index,
      previewCurrentUrl: url,
      previewFlyStyle: this.buildFlyStyle(target, tx, ty, scale)
    });
    wx.nextTick(() => {
      this.setData({
        previewAnimating: true,
        previewFlyStyle: this.buildFlyStyle(target, 0, 0, 1)
      });

      if (this._previewTimer) clearTimeout(this._previewTimer);
      this._previewTimer = setTimeout(() => {
        this.setData({
          previewExpanded: true,
          previewAnimating: false
        });
      }, PREVIEW_ANIM_MS);
    });
  },

  openPreviewFallback(index, url) {
    this.setData({
      previewVisible: true,
      previewExpanded: true,
      previewAnimating: false,
      previewIndex: index,
      previewCurrentUrl: url,
      previewFlyStyle: ''
    });
  },

  onPreviewSwiperChange(e) {
    const index = Number(e.detail.current || 0);
    const item = this.data.results[index];
    if (!item) return;
    this.setData({
      previewIndex: index,
      previewCurrentUrl: item.url
    });
    this.syncCurrentIndex(index);
  },

  onClosePreview() {
    if (!this.data.previewVisible) return;

    if (!this.data.previewExpanded || this._closingPreview) {
      this.resetPreview();
      return;
    }

    const index = this.data.previewIndex;
    const selector = `#hero-img-${index}`;

    wx.createSelectorQuery()
      .in(this)
      .select(selector)
      .boundingClientRect((rect) => {
        if (!rect || !rect.width) {
          this.resetPreview();
          return;
        }
        this.closePreviewWithRect(rect);
      })
      .exec();
  },

  closePreviewWithRect(rect) {
    const target = this.computePreviewTarget(rect);
    const cx0 = rect.left + rect.width / 2;
    const cy0 = rect.top + rect.height / 2;
    const cx1 = target.left + target.width / 2;
    const cy1 = target.top + target.height / 2;
    const scale = Math.min(rect.width / target.width, rect.height / target.height);
    const tx = cx0 - cx1;
    const ty = cy0 - cy1;

    this._closingPreview = true;
    this.setData({
      previewExpanded: false,
      previewVisible: true,
      previewAnimating: true,
      previewFlyStyle: this.buildFlyStyle(target, 0, 0, 1)
    });

    wx.nextTick(() => {
      this.setData({
        previewFlyStyle: this.buildFlyStyle(target, tx, ty, scale)
      });
    });

    if (this._previewTimer) clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => {
      this._closingPreview = false;
      this.resetPreview();
    }, PREVIEW_ANIM_MS);
  },

  resetPreview() {
    this.setData({
      previewVisible: false,
      previewExpanded: false,
      previewAnimating: false,
      previewFlyStyle: ''
    });
  },

  onDownloadPreview() {
    const item = this.data.results[this.data.previewIndex];
    if (!item || !item.url) {
      wx.showToast({ title: '暂无图片', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中' });
    wx.downloadFile({
      url: item.url,
      success: (res) => {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
        });
      },
      fail: () => wx.showToast({ title: '下载失败', icon: 'none' }),
      complete: () => wx.hideLoading()
    });
  },

  onMakeAlbum() {
    const item = this.data.results[this.data.currentIndex];
    wx.showToast({
      title: item ? `制作影集：${item.name}` : '制作影集（待接入）',
      icon: 'none'
    });
  },

  async onMakeFrame() {
    const item = this.data.results[this.data.currentIndex];
    if (!item || !item.url) {
      wx.showToast({ title: '请先生成照片', icon: 'none' });
      return;
    }

    let photoFileId = item.url;
    if (!isCloudFileId(photoFileId)) {
      wx.showLoading({ title: '准备成片...', mask: true });
      try {
        photoFileId = await pickRandomCloudPhotoFileId();
      } catch (e) {
        wx.showToast({ title: e.message || '暂无云存储样片', icon: 'none' });
        return;
      } finally {
        wx.hideLoading();
      }
    }

    const app = getApp();
    app.globalData.pendingFrameOrder = {
      photoFileId,
      styleId: item.id || '',
      styleName: item.name || ''
    };

    wx.navigateTo({
      url: '/packageStore/pages/cloud/frame-selector/frame-selector?from=generate'
    });
  },

  onUnload() {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    if (this._previewTimer) clearTimeout(this._previewTimer);
    if (this._badgeHideTimer) clearTimeout(this._badgeHideTimer);
  }
});
