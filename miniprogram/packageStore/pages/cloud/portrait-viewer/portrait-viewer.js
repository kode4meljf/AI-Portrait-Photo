const app = getApp();
const { fetchStyleTemplates, fetchStylesByIds, pickStylesForShoot } = require('../../../../config/styles.js');
const { STYLE_TEMPLATES_COLLECTION } = require('../../../../config/constants.js');
const { consumePendingShoot, getShootCustomerId } = require('../../../../utils/shootContext.js');
const { filterStylesByGender, styleGenderFromCustomer } = require('../../../../utils/styleGender');
const { fetchCustomerUsedStyleIds } = require('../../../../utils/customerStyleHistory');
const { isCloudFileId } = require('../../../utils/cloudPhoto.js');
const { runShootPortraitGeneration } = require('../../../utils/shootGenerate.js');
const {
  isPortraitGenerating,
  retryPortraitTask,
  pollPortraitPhoto,
  kickPortraitWorker
} = require('../../../../utils/jimengPortraitAi.js');
const { normalizePhotos } = require('../../../../utils/portraitViewer/normalizeItems.js');
const {
  PORTRAIT_POINTS_SINGLE,
  fetchStoreBalance,
  assertPortraitBalance,
  isInsufficientBalanceError,
  promptInsufficientBalance,
  toastPortraitError
} = require('../../../../utils/portraitBilling.js');
const { setBatchFavorite, loadBatchFavorite } = require('../../../../utils/batchFavorite.js');
const { resolveLinkedCustomerId } = require('../../../utils/albumCustomer.js');
const { fetchPhotosByBatchId } = require('../../../../utils/batchPhotos.js');
const { countCustomerAiPhotos } = require('../../../utils/albumPhotos.js');
const { fetchAlbumPlatformConfig } = require('../../../../utils/platformSettings.js');
const { isValidStoreId } = require('../../../../utils/storeSession.js');

const db = wx.cloud.database();

const GALLERY_LIST_ROUTE = 'pages/gallery/gallery';
const GALLERY_TAB_URL = '/pages/gallery/gallery';

Page({
  data: {
    mode: 'live',
    batchId: '',
    phase: 'loading',
    originalUrl: '',
    results: [],
    currentIndex: 0,
    loadingProgressText: '',
    statusBarHeight: 20,
    navTitle: '生成中',
    retryDialogVisible: false,
    retryTargetIndex: -1,
    retryStyleName: '',
    retryBalance: 0,
    retryLoading: false,
    portraitCost: PORTRAIT_POINTS_SINGLE,
    batchFavorite: false
  },

  onLoad(options) {
    const sys = wx.getWindowInfo();
    const mode = options.mode || (options.batchId ? 'batch' : 'live');
    this._mode = mode;
    this.setData({ statusBarHeight: sys.statusBarHeight || 20, mode });

    if (mode === 'batch') {
      this.setData({ batchId: options.batchId || '', navTitle: '云相册' });
      this.loadBatchFavoriteState();
      this.loadBatchMeta();
      this.loadPhotos();
      return;
    }

    this.bootstrapLive(options);
  },

  onUnload() {
    this.stopPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onShow() {
    if (this._mode === 'batch' && this.data.batchId) {
      this.loadBatchMeta();
    }
  },

  async loadBatchMeta() {
    const batchId = this.data.batchId;
    if (!batchId) {
      this._batchCustomerId = '';
      return;
    }
    try {
      const res = await db.collection('batches').doc(batchId).get();
      this._batchCustomerId = (res.data && res.data.customerId) || '';
    } catch (e) {
      console.warn('[portrait-viewer] loadBatchMeta', e);
      this._batchCustomerId = '';
    }
  },

  stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  },

  bootstrapLive(options) {
    const pending = consumePendingShoot();
    const originalUrl = decodeURIComponent(
      (pending && pending.originalUrl) || options.originalUrl || ''
    );
    const count =
      pending && pending.count != null
        ? pending.count === 9
          ? 9
          : 3
        : Number(options.count || 3) === 9
          ? 9
          : 3;
    const styleIds = `${options.styleIds || ''}`.split(',').filter(Boolean);
    this._styles = [];
    this.setData({ originalUrl, navTitle: '生成中' });
    this.resolveStyles({ pending, styleIds, count, options })
      .then((styles) => {
        this._styles = styles;
        this.runGeneration();
      })
      .catch((err) => {
        console.error('[portrait-viewer] 风格加载失败', err);
        const msg = (err && err.message) || '风格加载失败';
        wx.showToast({ title: msg, icon: 'none', duration: 2800 });
        setTimeout(() => wx.navigateBack(), 1500);
      });
  },

  async resolveStyles({ pending, styleIds, count, options = {} }) {
    const n = count === 9 ? 9 : 3;
    const pendingStyles = pending && Array.isArray(pending.styles) ? pending.styles : [];
    if (pendingStyles.length) {
      return pendingStyles;
    }
    if (styleIds.length) {
      return fetchStylesByIds(db, styleIds, {
        collection: STYLE_TEMPLATES_COLLECTION,
        onlyEnabled: true
      });
    }

    const pool = await fetchStyleTemplates(db, {
      collection: STYLE_TEMPLATES_COLLECTION,
      onlyEnabled: true
    });
    if (!pool.length) {
      throw new Error('未获取到风格模板');
    }

    const customerId =
      getShootCustomerId(app) || String(options.customerId || '').trim();
    const customer = app.globalData.selectedCustomer;
    const hasLinkedCustomer = !!(customerId && customer && customer._id === customerId);
    const filtered = hasLinkedCustomer
      ? filterStylesByGender(pool, styleGenderFromCustomer(customer.gender))
      : pool;

    if (!filtered.length) {
      throw new Error('该性别暂无可用风格');
    }

    let usedStyleIds = [];
    const storeId = app.globalData.storeId;
    if (hasLinkedCustomer && storeId) {
      try {
        usedStyleIds = await fetchCustomerUsedStyleIds(db, storeId, customerId);
      } catch (e) {
        console.warn('[portrait-viewer] 读取客户风格历史失败', e);
      }
    }

    const preferRandom = !hasLinkedCustomer || usedStyleIds.length === 0;
    return pickStylesForShoot(filtered, n, { usedStyleIds, preferRandom });
  },

  async loadBatchFavoriteState() {
    const batchId = this.data.batchId || this._liveBatchId;
    if (!batchId) return;
    try {
      const isFavorite = await loadBatchFavorite(batchId);
      this.setData({ batchFavorite: isFavorite, batchId });
    } catch (e) {
      console.warn('[portrait-viewer] loadBatchFavoriteState', e);
    }
  },

  async loadPhotos() {
    if (!this.data.batchId) {
      wx.showToast({ title: '批次无效', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1200);
      return;
    }

    try {
      const photos = await fetchPhotosByBatchId(db, this.data.batchId);
      if (!photos.length) {
        wx.showToast({ title: '暂无照片', icon: 'none' });
        return;
      }

      const results = normalizePhotos(photos);
      const originalUrl = photos[0].originalUrl || '';
      const idx = Math.min(this.data.currentIndex, Math.max(0, results.length - 1));
      const current = results[idx];

      this.setData({
        phase: 'success',
        originalUrl,
        results,
        currentIndex: idx,
        navTitle: current ? current.name || '云相册' : '云相册'
      });

      this.notifyViewerReady();

      const hasGenerating = photos.some((p) => isPortraitGenerating(p.generateStatus || 'pending'));
      if (hasGenerating) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    } catch (error) {
      console.error('[portrait-viewer] 加载照片失败', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  startPolling() {
    if (this.pollingTimer) return;
    this.pollingTimer = setInterval(() => {
      this.loadPhotos();
    }, 3000);
  },

  notifyViewerReady() {
    wx.nextTick(() => {
      const viewer = this.selectComponent('#viewer');
      if (viewer && viewer.afterSuccessReady) viewer.afterSuccessReady();
    });
  },

  onNavBack() {
    if (this._mode === 'batch') {
      this._backToGalleryList();
      return;
    }
    wx.navigateBack();
  },

  /** batch 详情：上一页是云相册 Tab 则 navigateBack，否则（如从生成页 redirect 进来）switchTab 回列表 */
  _backToGalleryList() {
    const pages = getCurrentPages();
    if (pages.length >= 2) {
      const prev = pages[pages.length - 2];
      if (prev && prev.route === GALLERY_LIST_ROUTE) {
        wx.navigateBack();
        return;
      }
    }
    wx.switchTab({ url: GALLERY_TAB_URL });
  },

  onOpenGallery() {
    const batchId = this._liveBatchId || '';
    if (batchId) {
      wx.redirectTo({
        url: `/packageStore/pages/cloud/portrait-viewer/portrait-viewer?mode=batch&batchId=${encodeURIComponent(batchId)}`
      });
      return;
    }
    wx.switchTab({ url: '/pages/gallery/gallery' });
  },

  onViewerIndexChange(e) {
    const { index, styleName } = e.detail || {};
    const fallback = this._mode === 'batch' ? '云相册' : '';
    this.setData({
      currentIndex: index,
      navTitle: styleName || this.data.navTitle || fallback
    });
  },

  onPatchResults(e) {
    const { updates } = e.detail || {};
    if (updates && Object.keys(updates).length) {
      this.setData(updates);
    }
  },

  async onBatchFavorite(e) {
    const batchId = this.data.batchId || this._liveBatchId;
    if (!batchId) return;
    const next = !!(e.detail && e.detail.favorite);
    try {
      await setBatchFavorite(batchId, next);
      this.setData({ batchFavorite: next });
      wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'success' });
    } catch (err) {
      console.warn('[portrait-viewer] onBatchFavorite', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async runGeneration() {
    try {
      const styles = this._styles || [];
      const styleCount = styles.length;
      this.setData({ loadingProgressText: styleCount > 0 ? `0/${styleCount}` : '' });
      await assertPortraitBalance(styleCount);
      const { results, failedCount, cloudOriginalUrl } = await this.callGenerateApi(styles);
      const firstName = results[0]?.name || '';
      this.setData({
        phase: 'success',
        originalUrl: cloudOriginalUrl || this.data.originalUrl,
        results,
        currentIndex: 0,
        navTitle: firstName
      });
      if (failedCount > 0) {
        const failedItems = results.filter((item) => item.status === 'failed');
        const allInsufficient =
          failedItems.length > 0 &&
          failedItems.every((item) => isInsufficientBalanceError(item.errorMsg || item.failLabel));
        if (allInsufficient) {
          await promptInsufficientBalance({
            balance: await fetchStoreBalance(),
            required: styleCount
          });
        } else {
          wx.showToast({
            title: failedCount === results.length ? '全部生成失败' : `${failedCount} 个风格失败`,
            icon: 'none'
          });
        }
      }
      this.notifyViewerReady();
    } catch (err) {
      console.error('[portrait-viewer] 生成失败', err);
      if (isInsufficientBalanceError(err)) {
        await promptInsufficientBalance({
          balance: await fetchStoreBalance(),
          required: (this._styles || []).length || 1
        });
      } else {
        toastPortraitError(err, '生成失败');
      }
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async callGenerateApi(styles) {
    const { originalUrl } = this.data;
    if (!originalUrl || !styles.length) {
      throw new Error('缺少原图或风格信息');
    }

    return runShootPortraitGeneration(originalUrl, styles, {
      onBatchCreated: (batchId) => {
        this._liveBatchId = batchId || '';
        this.setData({ batchId: batchId || '' });
        this.loadBatchFavoriteState();
      },
      onProgress: ({ completed, total }) => {
        if (total <= 0) return;
        this.setData({
          loadingProgressText: `${completed}/${total}`
        });
      }
    });
  },

  async onRetryTap(e) {
    const index = Number((e.detail && e.detail.index) ?? this.data.currentIndex);
    const item = this.data.results[index];
    if (!item || item.status !== 'failed') return;
    const balance = await fetchStoreBalance();
    this.setData({
      retryDialogVisible: true,
      retryTargetIndex: index,
      retryStyleName: item.name || '',
      retryBalance: balance
    });
  },

  onRetryCancel() {
    if (this.data.retryLoading) return;
    this.setData({ retryDialogVisible: false, retryTargetIndex: -1 });
  },

  async onRetryConfirm() {
    const index = this.data.retryTargetIndex;
    const item = this.data.results[index];
    if (!item || item.status !== 'failed') return;

    this.setData({ retryLoading: true, [`results[${index}].status`]: 'retrying' });
    try {
      await retryPortraitTask(item.photoId, item.styleId || item.id);
      if (this._mode === 'batch') {
        kickPortraitWorker({ batchId: this.data.batchId || '' });
        this.startPolling();
      } else {
        kickPortraitWorker();
      }

      const photo = await pollPortraitPhoto(item.photoId, {
        intervalMs: 3000,
        maxWaitMs: 600000
      });

      if (this._mode === 'batch') {
        await this.loadPhotos();
      } else {
        this.setData({
          [`results[${index}].status`]: 'success',
          [`results[${index}].url`]: photo.aiUrl || photo.originalUrl
        });
      }

      this.setData({
        retryDialogVisible: false,
        retryLoading: false,
        retryTargetIndex: -1,
        retryBalance: Math.max(0, (this.data.retryBalance || 0) - PORTRAIT_POINTS_SINGLE)
      });
      wx.showToast({ title: '生成完成', icon: 'success' });
    } catch (err) {
      console.error('[portrait-viewer] 重试失败', err);
      if (this._mode === 'batch') {
        await this.loadPhotos();
      } else {
        this.setData({ [`results[${index}].status`]: 'failed' });
      }
      this.setData({
        retryDialogVisible: false,
        retryLoading: false,
        retryTargetIndex: -1
      });
      toastPortraitError(err, '重试失败');
    }
  },

  async onMakeAlbum() {
    const customerId = resolveLinkedCustomerId(app, {
      customerId: this._batchCustomerId
    });
    if (!customerId) {
      wx.showToast({ title: '请先关联客户', icon: 'none', duration: 2400 });
      return;
    }

    const storeId = app.globalData.storeId;
    if (!isValidStoreId(storeId)) {
      wx.showToast({ title: '请先登录门店', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '校验中…', mask: true });
    try {
      const albumConfig = await fetchAlbumPlatformConfig();
      const entryMin = albumConfig.albumEntryMinTotal;
      const total = await countCustomerAiPhotos(db, storeId, customerId, entryMin);
      wx.hideLoading();
      if (total < entryMin) {
        wx.showModal({
          title: '数量不足',
          content: `该客户 AI 写真仅 ${total} 张，需要达到 ${entryMin} 张才可制作影集。`,
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      app.globalData.pendingAlbumPlatformConfig = albumConfig
      wx.navigateTo({
        url: `/packageStore/pages/cloud/album-maker/album-maker?customerId=${encodeURIComponent(customerId)}`
      });
    } catch (err) {
      wx.hideLoading();
      console.error('[portrait-viewer] onMakeAlbum', err);
      wx.showToast({ title: '校验失败，请重试', icon: 'none' });
    }
  },

  onMakeFrame(e) {
    const detail = e.detail || {};
    const item = detail.item || this.data.results[detail.index ?? this.data.currentIndex];
    if (!item || !item.url) {
      wx.showToast({ title: '请先生成照片', icon: 'none' });
      return;
    }

    const photoFileId = item.url;
    if (!isCloudFileId(photoFileId)) {
      wx.showToast({ title: '成片须为云存储文件', icon: 'none' });
      return;
    }

    const customerId =
      this._batchCustomerId ||
      app.globalData.galleryFilterCustomerId ||
      app.globalData.selectedCustomerId ||
      null;

    app.globalData.pendingFrameOrder = {
      photoFileId,
      styleId: item.styleId || item.id || '',
      styleName: item.name || '',
      customerId: customerId || null
    };

    wx.navigateTo({
      url: '/packageStore/pages/cloud/frame-selector/frame-selector'
    });
  }
});
