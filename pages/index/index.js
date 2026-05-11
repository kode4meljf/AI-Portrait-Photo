/**
 * @file 首页
 * @description 拍照/相册选择、客户选择、权益展示、风格模板展示（从云数据库加载）
 */

const app = getApp();
const { chooseAndUpload, uploadSingle } = require('../../utils/media.js');

Page({
  data: {
    // 客户相关
    selectedCustomer: null,
    showCancelBtn: false,
    checkinDays: 0,
    equityAlbum: 0,
    equityFrame: 0,
    // 风格模板（从数据库加载）
    templates: [],
    // 门店信息
    storeInfo: null,
    // 加载状态
    loading: false
  },

  onLoad() {
    this.loadStoreInfo();
    this.loadTemplates();      // 从云数据库加载模板
    this.refreshCustomerInfo();
  },

  onShow() {
    if (app.globalData.selectedCustomerId !== this.data.selectedCustomer?._id) {
      this.refreshCustomerInfo();
    }
  },

  onHide() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  },

  // ==================== 门店信息 ====================
  async loadStoreInfo() {
    const storeId = app.globalData.storeId;
    if (storeId && storeId !== 'mock_store_id') {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('store_profile').doc(storeId).get();
        this.setData({ storeInfo: res.data });
      } catch (e) {
        console.log('门店信息加载失败', e);
      }
    }
  },

  // ==================== 风格模板（从云数据库加载） ====================
  async loadTemplates() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('templates').get();
      if (res.data && res.data.length > 0) {
        // 按 id 升序排列
        const templates = res.data.sort((a, b) => Number(a.id) - Number(b.id));
        this.setData({ templates });
      } else {
        // 降级：使用本地默认模板
        this.setDefaultTemplates();
      }
    } catch (err) {
      console.error('加载模板失败', err);
      this.setDefaultTemplates();
    }
  },

  setDefaultTemplates() {
    const templates = [
      { id: "1", name: "油画质感", thumb: "https://picsum.photos/400/400?random=61", prompt: "" },
      { id: "2", name: "杂志封面", thumb: "https://picsum.photos/400/400?random=62", prompt: "" },
      { id: "3", name: "古风唯美", thumb: "https://picsum.photos/400/400?random=63", prompt: "" },
      { id: "4", name: "法式浪漫", thumb: "https://picsum.photos/400/400?random=64", prompt: "" }
    ];
    this.setData({ templates });
  },

  // ==================== 客户相关 ====================
  async refreshCustomerInfo() {
    const customerId = app.globalData.selectedCustomerId;
    if (!customerId) {
      this.setData({
        selectedCustomer: null,
        showCancelBtn: false,
        checkinDays: 0,
        equityAlbum: 0,
        equityFrame: 0
      });
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection('customers').doc(customerId).get();
      const customer = res.data;
      this.setData({
        selectedCustomer: customer,
        showCancelBtn: true,
        checkinDays: customer.totalCheckins || 0,
        equityAlbum: customer.equityAlbum || 0,
        equityFrame: customer.equityFrame || 0
      });
    } catch (error) {
      console.error('获取客户信息失败:', error);
    }
  },

  onSelectCustomer() {
    wx.navigateTo({ url: '/packageProfile/pages/customer-list/customer-list?selectMode=true' });
  },

  onCancelSelect() {
    app.globalData.selectedCustomerId = null;
    wx.removeStorageSync('selectedCustomerId');
    this.refreshCustomerInfo();
    const pages = getCurrentPages();
    pages.forEach(page => {
      if (page.refreshData) page.refreshData();
    });
  },

  previewTemplate(e) {
    const template = this.data.templates[e.currentTarget.dataset.index];
    if (template && template.thumb) {
      wx.previewImage({ urls: [template.thumb], current: template.thumb });
    } else {
      wx.showToast({ title: '预览失败', icon: 'none' });
    }
  },

  // ==================== 拍照/相册上传 ====================
  // 微信原生 chooseAvatar 回调（单张）
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) return;
    uploadSingle(avatarUrl).catch(err => console.error('上传失败', err));
  },

  // 选择媒体并上传（支持多张）
  chooseMedia() {
    chooseAndUpload({ sourceType: ['camera', 'album'], count: 9 })
      .catch(err => console.error('选择失败', err));
  },

  // 头像点击放大预览
  previewAvatar() {
    const url = this.data.selectedCustomer?.avatarUrl;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  // ==================== 其他功能 ====================
  onMoreTemplates() {
    wx.showToast({ title: '更多风格即将上线', icon: 'none' });
  },

  onViewAllCustomers() {
    wx.navigateTo({ url: '/packageProfile/pages/customer-list/customer-list?selectMode=false' });
  },

  onRecentItemTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.showToast({ title: `查看详情 ${id}`, icon: 'none' });
  }
});