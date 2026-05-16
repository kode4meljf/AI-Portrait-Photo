const app = getApp();

const MOCK_FRAMES = [
  {
    id: '1',
    name: '原木火烈鸟',
    thumb: 'https://picsum.photos/seed/frame-flamingo/432/528',
    price: 20,
    size: '20cm × 25cm',
    material: '原木'
  },
  {
    id: '2',
    name: '黑色小羊',
    thumb: 'https://picsum.photos/seed/frame-sheep/432/528',
    price: 20,
    size: '20cm × 25cm',
    material: '金属'
  },
  {
    id: '3',
    name: '简约婚纱',
    thumb: 'https://picsum.photos/seed/frame-wedding/432/528',
    price: 20,
    size: '20cm × 30cm',
    material: '亚克力'
  }
];

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
    selectedFrameId: '1',
    frameCost: 20,
    storeInfo: MOCK_STORE,
    submitting: false,
    showPreview: false,
    previewImageReady: false,
    previewFrameName: '',
    previewFrameSize: ''
  },

  onLoad(options) {
    const photoUrl = decodeURIComponent(options.photoUrl || '');
    const styleId = options.styleId || '';
    const styleName = decodeURIComponent(options.styleName || '');
    this.setData({ photoUrl, styleId, styleName });
    this.loadFrames();
    this.loadStoreInfo();
  },

  onShow() {
    if (this._storeLoaded) {
      this.loadStoreInfo();
    } else {
      this._storeLoaded = true;
    }
  },

  loadFrames() {
    // TODO: 从 frame_templates 等集合拉取
    const first = MOCK_FRAMES[0];
    this.setData({
      frames: MOCK_FRAMES,
      selectedFrameId: first?.id || '',
      frameCost: first?.price ?? 20
    });
  },

  async loadStoreInfo() {
    const storeId = app.globalData.storeId;
    if (!storeId || storeId === 'mock_store_id') {
      this.setData({ storeInfo: MOCK_STORE });
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection('store_profile').doc(storeId).get();
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
    const frame = this.data.frames.find((f) => f.id === id);
    this.setData({
      selectedFrameId: id,
      frameCost: frame?.price ?? 20
    });
  },

  onTapStore() {
    wx.navigateTo({ url: '/pages/profile/edit-store/edit-store' });
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
    this.setData({
      showPreview: true,
      previewImageReady: false,
      previewFrameName: frame.name,
      previewFrameSize: frame.size || ''
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
    const { photoUrl, submitting } = this.data;
    if (submitting) return;
    if (!frame) {
      wx.showToast({ title: '请选择相框款式', icon: 'none' });
      return;
    }
    if (!photoUrl) {
      wx.showToast({ title: '缺少生成照片', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'createOrder',
        data: {
          frameTemplateId: frame.id,
          frameName: frame.name,
          size: frame.size,
          material: frame.material,
          price: frame.price,
          photos: [photoUrl],
          customerId: app.globalData.selectedCustomerId || null,
          styleId: this.data.styleId || null,
          styleName: this.data.styleName || null
        }
      });

      if (res.result && res.result.success) {
        wx.showToast({ title: '订单已提交', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/order-list/order-list' });
        }, 1500);
      } else {
        throw new Error(res.result?.error || '订单提交失败');
      }
    } catch (err) {
      console.error('[frame-selector] 下单失败', err);
      wx.showToast({
        title: err.message || '提交失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
      wx.hideLoading();
    }
  }
});
