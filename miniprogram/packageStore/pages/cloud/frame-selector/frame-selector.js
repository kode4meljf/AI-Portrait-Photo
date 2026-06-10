const app = getApp();
const { isCloudFileId } = require('../../../utils/cloudPhoto');
const { callOrderApi } = require('../../../../utils/orderApi');
const { isStoreAccount, getProfileCollection } = require('../../../../utils/account');
const { isValidStoreId } = require('../../../../utils/storeSession');
const { isStoreOwner } = require('../../../../utils/storeRole');
const { FRAME_ORDER_COST, fetchFrameTemplates } = require('../../../config/frames.js');
const {
  assertStorePoints,
  isInsufficientBalanceError,
  promptInsufficientBalance,
  fetchStoreBalance,
  FRAME_POINTS
} = require('../../../../utils/portraitBilling.js');
const { resolveFrameOrderCustomerId } = require('../../../../utils/frameOrderCustomer.js');
const db = wx.cloud.database();

const MOCK_STORE = {
  name: '澜石 AI 写真馆',
  address: '澜石大马路泷景5期 4期7座 2203',
  contactName: '许文强',
  contactPhone: '13577775555'
};

Page({
  data: {
    photoUrl: '',
    styleId: '',
    styleName: '',
    frames: [],
    loadingFrames: false,
    framesError: '',
    selectedFrameId: '',
    previewFrameTheme: 1,
    frameCost: FRAME_ORDER_COST,
    storeInfo: MOCK_STORE,
    submitting: false,
    showPreview: false,
    previewImageReady: false,
    previewFrameName: '',
    previewFrameSize: ''
  },

  onLoad(options) {
    let photoUrl = '';
    let styleId = options.styleId || '';
    let styleName = decodeURIComponent(options.styleName || '');

    const pending = app.globalData.pendingFrameOrder;
    if (pending && pending.photoFileId) {
      photoUrl = pending.photoFileId;
      styleId = pending.styleId || styleId;
      styleName = pending.styleName || styleName;
    } else {
      photoUrl = decodeURIComponent(options.photoUrl || '');
    }

    this.setData({ photoUrl, styleId, styleName });
    this.loadFrames();
    this.loadStoreInfo();
  },

  onShow() {
    this.setData({ isOwner: isStoreOwner(app) });
    if (this._storeLoaded) {
      this.loadStoreInfo();
    } else {
      this._storeLoaded = true;
    }
  },

  async loadFrames() {
    this.setData({ loadingFrames: true, framesError: '' });
    try {
      const frames = await fetchFrameTemplates(db, { limit: 50, onlyEnabled: true });
      if (!frames.length) {
        this.setData({
          frames: [],
          selectedFrameId: '',
          framesError: '暂无可用相框，请在管理后台配置'
        });
        wx.showToast({ title: '暂无可用相框', icon: 'none' });
        return;
      }
      this.setData({
        frames,
        selectedFrameId: frames[0].id,
        frameCost: FRAME_ORDER_COST,
        framesError: ''
      });
    } catch (err) {
      console.error('[frame-selector] 加载相框失败', err);
      this.setData({
        frames: [],
        selectedFrameId: '',
        framesError: '加载相框失败，请检查网络后重试'
      });
      wx.showToast({ title: '加载相框失败', icon: 'none' });
    } finally {
      this.setData({ loadingFrames: false });
    }
  },

  async loadStoreInfo() {
    if (!isStoreAccount()) {
      this.setData({ storeInfo: { ...MOCK_STORE, name: '个人用户（摆台配送信息待完善）' } });
      return;
    }
    const storeId = app.globalData.storeId;
    if (!isValidStoreId(storeId)) {
      this.setData({ storeInfo: MOCK_STORE });
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection(getProfileCollection()).doc(storeId).get();
      const info = res.data || {};
      this.setData({
        storeInfo: {
          name: info.name || MOCK_STORE.name,
          address: this.formatAddress(info) || MOCK_STORE.address,
          contactName: info.contactName || MOCK_STORE.contactName,
          contactPhone: info.contactPhone || MOCK_STORE.contactPhone
        }
      });
    } catch (e) {
      console.error('[frame-selector] 门店信息加载失败', e);
      this.setData({ storeInfo: MOCK_STORE });
    }
  },

  formatAddress(info) {
    const parts = [info.addressName, info.addressDetail, info.houseNumber, info.address]
      .map((s) => (s || '').trim())
      .filter(Boolean);
    return parts.length ? parts.join(' ') : '';
  },

  onSelectFrame(e) {
    const { id } = e.currentTarget.dataset;
    if (!id || id === this.data.selectedFrameId) return;
    this.setData({
      selectedFrameId: id,
      frameCost: FRAME_ORDER_COST
    });
  },

  onTapStore() {
    wx.navigateTo({ url: '/packageStore/pages/profile/edit-store/edit-store' });
  },

  onOpenPreview() {
    const { photoUrl } = this.data;
    const frame = this.getSelectedFrame();
    if (!photoUrl) {
      wx.showToast({ title: '缺少生成照片', icon: 'none' });
      return;
    }
    if (!frame) {
      wx.showToast({ title: '请选择相框款式', icon: 'none' });
      return;
    }
    const frameIndex = this.data.frames.findIndex((f) => f.id === frame.id);
    const previewFrameTheme = (frameIndex >= 0 ? frameIndex : 0) % 3 + 1;
    this.setData({
      showPreview: true,
      previewImageReady: false,
      previewFrameName: frame.name,
      previewFrameSize: frame.specText || frame.size || '',
      previewFrameTheme
    });
  },

  onClosePreview() {
    this.setData({ showPreview: false, previewImageReady: false });
  },

  preventMove() {},

  onPreviewPhotoLoad() {
    this.setData({ previewImageReady: true });
  },

  onPreviewPhotoError() {
    wx.showToast({ title: '照片加载失败', icon: 'none' });
  },

  getSelectedFrame() {
    const { frames, selectedFrameId } = this.data;
    return frames.find((f) => f.id === selectedFrameId) || null;
  },

  async onSubmit() {
    const frame = this.getSelectedFrame();
    const { photoUrl, styleId, styleName, submitting } = this.data;
    if (submitting) return;
    if (!frame) {
      wx.showToast({ title: '请选择相框款式', icon: 'none' });
      return;
    }
    if (!photoUrl) {
      wx.showToast({ title: '缺少生成照片', icon: 'none' });
      return;
    }
    if (!isCloudFileId(photoUrl)) {
      wx.showToast({ title: '成片须为云存储地址', icon: 'none' });
      return;
    }
    if (!isValidStoreId(app.globalData.storeId)) {
      wx.showToast({ title: '请先登录门店', icon: 'none' });
      return;
    }

    const customerId = resolveFrameOrderCustomerId(app, app.globalData.pendingFrameOrder);
    if (!customerId) {
      const modal = await wx.showModal({
        title: '未关联客户',
        content: '下单时未关联客户，顾客端「我的订单」将无法看到该订单。是否仍要提交？',
        confirmText: '仍要提交',
        cancelText: '取消'
      });
      if (!modal.confirm) return;
    }

    try {
      await assertStorePoints(FRAME_POINTS);
    } catch (e) {
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      await callOrderApi('create', {
        orderType: 'frame',
        frameTemplateId: frame.id,
        frameName: frame.name,
        photoUrl,
        styleId: styleId || '',
        styleName: styleName || '',
        customerId
      });

      if (app.globalData.pendingFrameOrder) {
        app.globalData.pendingFrameOrder = null;
      }
      app.globalData.ordersNeedRefresh = true;
      wx.switchTab({ url: '/pages/order-list/order-list' });
    } catch (err) {
      if (isInsufficientBalanceError(err)) {
        await promptInsufficientBalance({
          balance: await fetchStoreBalance(),
          required: FRAME_POINTS
        });
      } else {
        wx.showToast({
          title: err.message || '提交失败，请重试',
          icon: 'none',
          duration: 3000
        });
      }
    } finally {
      this.setData({ submitting: false });
      wx.hideLoading();
    }
  }
});
