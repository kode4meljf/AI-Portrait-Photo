/**
 * @file 首页
 */

const app = getApp();
const { uploadSingle } = require('../../utils/media.js');

function formatNow() {
  const d = new Date();
  const p = (n) => `${n}`.padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 原生 TabBar 层级高于普通 view，弹层期间隐藏 TabBar，关闭后恢复 */
function hideTabBarForOverlay() {
  wx.hideTabBar({ animation: true, fail: () => {} });
}

function showTabBarAfterOverlay() {
  wx.showTabBar({ animation: true, fail: () => {} });
}

Page({
  data: {
    selectedCustomer: null,
    pickerVisible: false,
    pickerSelectedId: '',
    checkinDays: 0,
    equityAlbum: 0,
    equityFrame: 0,
    templates: [],
    storeInfo: null,
    loading: false,
    checkinResult: null,
    hasCheckedInOnce: false,
    todayServiceCount: 0
  },

  onLoad() {
    this.loadStoreInfo();
    this.loadTemplates();
    this.refreshCustomerInfo();
  },

  onShow() {
    if (!this.data.pickerVisible) {
      showTabBarAfterOverlay();
    }
    if (app.globalData.selectedCustomerId !== this.data.selectedCustomer?._id) {
      this.refreshCustomerInfo();
    }
  },

  onHide() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.data.pickerVisible) {
      showTabBarAfterOverlay();
      this.setData({ pickerVisible: false });
    }
  },

  onUnload() {
    if (this.data.pickerVisible) {
      showTabBarAfterOverlay();
    }
  },

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

  async loadTemplates() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('templates').get();
      if (res.data && res.data.length > 0) {
        const templates = res.data.sort((a, b) => Number(a.id) - Number(b.id));
        this.setData({ templates });
      } else {
        this.setDefaultTemplates();
      }
    } catch (err) {
      console.error('加载模板失败', err);
      this.setDefaultTemplates();
    }
  },

  setDefaultTemplates() {
    const templates = [
      { id: '1', name: '油画质感', thumb: 'https://picsum.photos/400/400?random=61', prompt: '' },
      { id: '2', name: '杂志封面', thumb: 'https://picsum.photos/400/400?random=62', prompt: '' },
      { id: '3', name: '古风唯美', thumb: 'https://picsum.photos/400/400?random=63', prompt: '' },
      { id: '4', name: '法式浪漫', thumb: 'https://picsum.photos/400/400?random=64', prompt: '' }
    ];
    this.setData({ templates });
  },

  async refreshCustomerInfo() {
    const customerId = app.globalData.selectedCustomerId;
    if (!customerId) {
      this.setData({
        selectedCustomer: null,
        pickerSelectedId: '',
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
        pickerSelectedId: customer._id || '',
        checkinDays: customer.totalCheckins || 0,
        equityAlbum: customer.equityAlbum || 0,
        equityFrame: customer.equityFrame || 0
      });
    } catch (error) {
      console.error('获取客户信息失败:', error);
    }
  },

  onSelectCustomer() {
    hideTabBarForOverlay();
    this.setData({ pickerVisible: true });
  },

  onPickerSelect(e) {
    const { customer } = e.detail;
    this.setData({
      pickerVisible: false,
      selectedCustomer: customer,
      pickerSelectedId: customer._id || '',
      checkinDays: customer.totalCheckins || 0,
      equityAlbum: customer.equityAlbum || 0,
      equityFrame: customer.equityFrame || 0
    });
    showTabBarAfterOverlay();
  },

  onPickerClose() {
    this.setData({ pickerVisible: false });
    showTabBarAfterOverlay();
  },

  onCancelSelect() {
    app.globalData.selectedCustomerId = null;
    wx.removeStorageSync('selectedCustomerId');
    this.refreshCustomerInfo();
  },

  async onCheckinTap() {
    try {
      const scanRes = await new Promise((resolve, reject) => {
        wx.scanCode({
          onlyFromCamera: true,
          scanType: ['qrCode'],
          success: resolve,
          fail: reject
        });
      });

      const payload = this.parseCheckinPayload(scanRes.result);
      if (!payload || !payload.customerId) {
        wx.showToast({ title: '二维码无效', icon: 'none' });
        return;
      }

      const customer = await this.upsertCustomerAndCheckin(payload);
      this.setData({
        checkinResult: {
          ...customer,
          timeText: `打卡时间 ${formatNow()}`,
          totalCheckins: customer.totalCheckins || 0
        },
        hasCheckedInOnce: true,
        selectedCustomer: customer,
        pickerSelectedId: customer._id || ''
      });

      app.globalData.selectedCustomerId = customer._id;
      app.globalData.selectedCustomer = customer;
      wx.setStorageSync('selectedCustomerId', customer._id);

      wx.showToast({ title: '今日已打卡', icon: 'success' });
    } catch (e) {
      if (e && (e.errMsg || '').includes('cancel')) return;
      console.error('扫码打卡失败', e);
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  parseCheckinPayload(raw) {
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (obj && obj.type === 'customer_checkin') return obj;
      return obj;
    } catch (e) {
      const id = `${raw}`.trim();
      if (!id) return null;
      return { customerId: id };
    }
  },

  async upsertCustomerAndCheckin(payload) {
    const db = wx.cloud.database();
    const _ = db.command;
    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStamp = today.getTime();

    let customer = null;
    const byId = await db.collection('customers').where({ customerId: payload.customerId }).limit(1).get();
    if (byId.data.length > 0) {
      customer = byId.data[0];
      await db.collection('customers').doc(customer._id).update({
        data: {
          totalCheckins: _.inc(1),
          lastCheckinTime: now,
          lastCheckinDate: todayStamp,
          updateTime: now
        }
      });
      const latest = await db.collection('customers').doc(customer._id).get();
      customer = latest.data;
    } else {
      const createData = {
        customerId: payload.customerId,
        nickName: payload.name || '新客户',
        phone: payload.phone || '',
        avatarUrl: payload.avatarUrl || '/assets/icons/album-placeholder.png',
        totalCheckins: 1,
        lastCheckinTime: now,
        lastCheckinDate: todayStamp,
        createTime: now,
        updateTime: now
      };
      const addRes = await db.collection('customers').add({ data: createData });
      const latest = await db.collection('customers').doc(addRes._id).get();
      customer = latest.data;
    }

    return customer;
  },

  previewTemplate(e) {
    const template = this.data.templates[e.currentTarget.dataset.index];
    if (template && template.thumb) {
      wx.previewImage({ urls: [template.thumb], current: template.thumb });
    } else {
      wx.showToast({ title: '预览失败', icon: 'none' });
    }
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) return;
    uploadSingle(avatarUrl).catch(err => console.error('上传失败', err));
  },

  chooseMedia() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) {
          wx.showToast({ title: '未获取到图片', icon: 'none' });
          return;
        }
        const url = encodeURIComponent(file.tempFilePath);
        wx.navigateTo({ url: `/pages/cloud/style-selector/style-selector?originalUrl=${url}` });
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '选择失败', icon: 'none' });
      }
    });
  },

  previewAvatar() {
    const url = this.data.checkinResult?.avatarUrl || this.data.selectedCustomer?.avatarUrl;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onMoreTemplates() {
    wx.showToast({ title: '更多风格即将上线', icon: 'none' });
  }
});
