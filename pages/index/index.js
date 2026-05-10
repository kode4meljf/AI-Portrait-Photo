/**
 * @file 首页
 * @description 拍照/相册选择、客户选择、权益展示、风格模板展示（从云数据库加载）
 */

const app = getApp();

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
    // 弹窗控制
    showModal: false,
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
  showShootModal() {
    this.setData({ showModal: true });
  },

  hideShootModal() {
    this.setData({ showModal: false });
  },

  stopPropagation() {},

  takePhotoFromCamera() {
    this.hideShootModal();
    this.chooseMedia('camera');
  },

  choosePhotoFromAlbum() {
    this.hideShootModal();
    this.chooseMedia('album');
  },

  chooseMedia(sourceType) {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: [sourceType],
      success: async (res) => {
        wx.showLoading({ title: '处理中...' });
        try {
          // 1. 先创建一个批次
          const batchId = await this.createBatch();
          let successCount = 0;
          // 2. 循环上传每张图片
          for (const file of res.tempFiles) {
            const ok = await this.uploadAndSavePhoto(file.tempFilePath, batchId);
            if (ok) successCount++;
          }
          wx.hideLoading();
          if (successCount > 0) {
            wx.showToast({ title: `成功上传${successCount}张`, icon: 'success' });
            // 刷新云相册页面（如果已打开）
            const pages = getCurrentPages();
            const galleryPage = pages.find(p => p.route === 'pages/gallery/gallery');
            if (galleryPage && galleryPage.refreshData) {
              galleryPage.refreshData();
            }
          } else {
            wx.showToast({ title: '上传失败，请重试', icon: 'error' });
          }
        } catch (err) {
          console.error('上传过程出错', err);
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'error' });
        }
      },
      fail: (err) => {
        console.error('选择图片失败', err);
      }
    });
  },

  async createBatch() {
    const db = wx.cloud.database();
    const storeId = app.globalData.storeId;
    if (!storeId || storeId === 'mock_store_id') {
      throw new Error('门店ID无效');
    }
    const res = await db.collection('batches').add({
      data: {
        storeId: storeId,
        customerId: app.globalData.selectedCustomerId || null,
        status: 'pending',
        photoIds: [],
        createTime: db.serverDate()
      }
    });
    return res._id;
  },

  async uploadAndSavePhoto(tempFilePath, batchId) {
    const storeId = app.globalData.storeId;
    if (!storeId || storeId === 'mock_store_id') {
      console.error('storeId无效');
      return false;
    }
    try {
      // 压缩
      const compressedPath = await this.compressImage(tempFilePath);
      // 上传云存储
      const cloudPath = `photos/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: compressedPath
      });
      console.log('上传fileID:', uploadRes.fileID);
      const db = wx.cloud.database();
      // 添加照片记录
      await db.collection('photos').add({
        data: {
          batchId: batchId,
          storeId: storeId,
          customerId: app.globalData.selectedCustomerId || null,
          originalUrl: uploadRes.fileID,
          aiUrl: null,
          isGenerated: false,
          isFavorite: false,
          createTime: db.serverDate()
        }
      });
      // 更新 batch 中的 photoIds 数组
      await db.collection('batches').doc(batchId).update({
        data: {
          photoIds: db.command.push([uploadRes.fileID])
        }
      });
      return true;
    } catch (err) {
      console.error('单张上传失败', err);
      return false;
    }
  },

  compressImage(src) {
    return new Promise((resolve, reject) => {
      wx.compressImage({
        src,
        quality: 80,
        compressedWidth: 1080,
        success: (res) => resolve(res.tempFilePath),
        fail: reject
      });
    });
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