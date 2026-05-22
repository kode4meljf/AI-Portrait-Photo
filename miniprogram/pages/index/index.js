/**
 * @file 首页
 */

const app = getApp();
const { uploadSingle } = require('../../utils/media.js');
const { STYLE_TEMPLATES_COLLECTION } = require('../../config/constants.js');
const { fetchStyleTemplates } = require('../../config/styles.js');
const { isValidStoreId } = require('../../utils/storeSession');
const { redirectCustomerIfNeeded } = require('../../utils/storeGuard');
const { getProfileCollection } = require('../../utils/account');
const { getCustomerDisplayName } = require('../../utils/customerDisplay');
const { applyShootCustomer, clearShootCustomer, buildShootQuery } = require('../../utils/shootContext');
const { syncStoreTabBar } = require('../../utils/storeTabBar');

function linkedCustomerView(customer) {
  if (!customer) {
    return {
      hasLinkedCustomer: false,
      linkedCustomerName: '',
      linkedCustomerAvatar: '',
      linkedCustomerInitial: ''
    };
  }
  const linkedCustomerName = getCustomerDisplayName(customer);
  return {
    hasLinkedCustomer: true,
    linkedCustomerName,
    linkedCustomerAvatar: customer.avatarUrl || '',
    linkedCustomerInitial: (linkedCustomerName || '客').slice(0, 1)
  };
}

function formatNow() {
  const d = new Date();
  const p = (n) => `${n}`.padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 弹层期间隐藏 TabBar；关闭 animation 降低 DevTools routeDone/webviewId 报错概率 */
let tabBarHiddenForOverlay = false;

function hideTabBarForOverlay() {
  if (tabBarHiddenForOverlay) return;
  tabBarHiddenForOverlay = true;
  wx.hideTabBar({
    animation: false,
    fail: () => {
      tabBarHiddenForOverlay = false;
    }
  });
}

function showTabBarAfterOverlay() {
  if (!tabBarHiddenForOverlay) return;
  tabBarHiddenForOverlay = false;
  wx.showTabBar({ animation: false, fail: () => {} });
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
    todayVisitCount: 0,
    hasLinkedCustomer: false,
    linkedCustomerName: '',
    linkedCustomerAvatar: '',
    linkedCustomerInitial: ''
  },

  onLoad() {
    this.loadStoreInfo();
    this.loadTodayVisitCount();
    this.loadTemplates();
    this.refreshCustomerInfo();
  },

  onShow() {
    redirectCustomerIfNeeded().then((redirected) => {
      if (redirected) return;
      this._onShowStore();
    });
  },

  _onShowStore() {
    syncStoreTabBar(this);
    if (!isValidStoreId(app.globalData.storeId)) {
      if (!this._relaunching) {
        this._relaunching = true;
        wx.reLaunch({
          url: '/pages/launch/launch',
          complete: () => {
            this._relaunching = false;
          }
        });
      }
      return;
    }
    if (!this.data.pickerVisible) {
      showTabBarAfterOverlay();
    }
    this.loadTodayVisitCount();
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
    if (!isValidStoreId(storeId)) return;
    try {
      const db = wx.cloud.database();
      const res = await db.collection(getProfileCollection()).doc(storeId).get();
      this.setData({ storeInfo: res.data || {} });
    } catch (e) {
      console.log('门店信息加载失败', e);
    }
  },

  /** 今日到店：当日打卡 customerId 去重人数 */
  async loadTodayVisitCount() {
    const storeId = app.globalData.storeId;
    if (!isValidStoreId(storeId)) return;
    try {
      const res = await wx.cloud.callFunction({
        name: 'storeStats',
        data: { action: 'checkin', storeId }
      });
      const stats = res.result || {};
      this.setData({ todayVisitCount: stats.todayCount || 0 });
    } catch (e) {
      console.error('加载今日到店失败', e);
    }
  },

  async loadTemplates() {
    try {
      const db = wx.cloud.database();
      const templates = await fetchStyleTemplates(db, {
        collection: STYLE_TEMPLATES_COLLECTION,
        limit: 12,
        onlyEnabled: true
      });
      this.setData({ templates: templates.slice(0, 4) });
    } catch (err) {
      console.error('加载模板失败', err);
      this.setData({ templates: [] });
    }
  },

  async refreshCustomerInfo() {
    const customerId = app.globalData.selectedCustomerId;
    if (!customerId) {
      app.globalData.selectedCustomer = null;
      wx.removeStorageSync('selectedCustomerId');
      this.setData({
        selectedCustomer: null,
        pickerSelectedId: '',
        checkinDays: 0,
        equityAlbum: 0,
        equityFrame: 0,
        ...linkedCustomerView(null)
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
        equityFrame: customer.equityFrame || 0,
        ...linkedCustomerView(customer)
      });
    } catch (error) {
      console.error('获取客户信息失败:', error);
    }
  },

  onLinkCustomer() {
    hideTabBarForOverlay();
    this.setData({ pickerVisible: true });
  },

  onUnlinkCustomer() {
    clearShootCustomer(app);
    this.setData({
      selectedCustomer: null,
      pickerSelectedId: '',
      checkinDays: 0,
      equityAlbum: 0,
      equityFrame: 0,
      ...linkedCustomerView(null)
    });
    wx.showToast({ title: '已取消关联，仍可继续拍摄', icon: 'none' });
  },

  onCreateCustomer() {
    wx.navigateTo({
      url: '/packageStore/pages/profile/customer-create/customer-create'
    });
  },

  onContinueCheckin() {
    this.onCheckinTap();
  },

  onPickerSelect(e) {
    const { customer } = e.detail;
    applyShootCustomer(app, customer);
    this.setData({
      pickerVisible: false,
      selectedCustomer: customer,
      pickerSelectedId: customer._id || '',
      checkinDays: customer.totalCheckins || 0,
      equityAlbum: customer.equityAlbum || 0,
      equityFrame: customer.equityFrame || 0,
      ...linkedCustomerView(customer)
    });
    showTabBarAfterOverlay();
  },

  onPickerClose() {
    this.setData({ pickerVisible: false });
    showTabBarAfterOverlay();
  },

  onPickerCustomerUpdated(e) {
    const { customer } = e.detail;
    if (!customer) return;
    applyShootCustomer(app, customer);
    this.setData({
      selectedCustomer: customer,
      pickerSelectedId: customer._id || '',
      checkinDays: customer.totalCheckins || 0,
      equityAlbum: customer.equityAlbum || 0,
      equityFrame: customer.equityFrame || 0,
      ...linkedCustomerView(customer)
    });
    if (this.data.checkinResult && this.data.checkinResult._id === customer._id) {
      this.setData({
        checkinResult: {
          ...this.data.checkinResult,
          nickName: customer.nickName,
          phone: customer.phone
        }
      });
    }
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
      const customerDocId = payload && payload.customerDocId;
      if (!customerDocId) {
        wx.showToast({ title: '二维码无效', icon: 'none' });
        return;
      }

      const { callCustomer } = require('../../utils/storeSession');
      const customer = await callCustomer('scan.bindCheckin', {
        customerDocId,
        wxNickName: payload.wxNickName,
        avatarUrl: payload.avatarUrl,
        wxOpenId: payload.wxOpenId,
        phone: payload.phone
      });
      this.setData({
        checkinResult: {
          ...customer,
          displayName: getCustomerDisplayName(customer),
          timeText: `打卡时间 ${formatNow()}`,
          totalCheckins: customer.totalCheckins || 0
        },
        hasCheckedInOnce: true,
        selectedCustomer: customer,
        pickerSelectedId: customer._id || ''
      });

      applyShootCustomer(app, customer);
      this.setData(linkedCustomerView(customer));

      wx.showToast({ title: '今日已打卡', icon: 'success' });
      this.loadTodayVisitCount();
    } catch (e) {
      if (e && (e.errMsg || '').includes('cancel')) return;
      console.error('扫码打卡失败', e);
      if (e.code === 'CUSTOMER_BOUND_OTHER_STORE') {
        wx.showModal({
          title: '无法打卡',
          content: e.message || '该客户已由其他门店管理',
          showCancel: false
        });
        return;
      }
      if (e.code === 'PHONE_QR_STALE' || e.code === 'WX_OPENID_MISMATCH') {
        wx.showModal({
          title: '无法打卡',
          content: e.message || '请让顾客刷新顾客码后再试',
          showCancel: false
        });
        return;
      }
      wx.showToast({ title: e.message || '扫码失败', icon: 'none' });
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
      return { customerDocId: id };
    }
  },

  onPreviewTemplate(e) {
    const index =
      e.detail && e.detail.index != null ? e.detail.index : e.currentTarget.dataset.index;
    const template = this.data.templates[index];
    const url = template && (template.sampleDisplayUrl || template.sampleFileId);
    if (url) {
      wx.previewImage({ urls: [url], current: url });
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
        const qs = buildShootQuery({ originalUrl: file.tempFilePath });
        wx.navigateTo({
          url: `/packageStore/pages/cloud/style-selector/style-selector?${qs}`
        });
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
    wx.navigateTo({ url: '/packageCustomer/pages/showcase/showcase' });
  }
});
