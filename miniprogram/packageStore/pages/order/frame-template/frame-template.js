// packageOrder/pages/frame-template/frame-template.js
const app = getApp();
const { resolvePhotoForOrder } = require('../../../../utils/media');
const { callOrderApi } = require('../../../../utils/orderApi');
const { FRAME_ORDER_COST, fetchFrameTemplates } = require('../../../config/frames.js');
const db = wx.cloud.database();

Page({
  behaviors: [require('../../../../behaviors/pageShare')],
  data: {
    photoUrls: [],
    templates: [],
    selectedTemplate: null,
    submitting: false,
    frameCost: FRAME_ORDER_COST
  },

  onLoad(options) {
    let photoUrls = [];
    try {
      photoUrls = JSON.parse(decodeURIComponent(options.photoUrls || "[]"));
    } catch (e) {
      console.error("解析photoUrls失败", e);
    }
    this.setData({ photoUrls });
    this.loadTemplates();
  },

  async loadTemplates() {
    try {
      const templates = await fetchFrameTemplates(db, { limit: 50, onlyEnabled: true });
      if (!templates.length) {
        this.setData({ templates: [] });
        wx.showToast({ title: '暂无可用相框', icon: 'none' });
        return;
      }
      this.setData({ templates });
    } catch (err) {
      console.error('[frame-template] 加载相框失败', err);
      this.setData({ templates: [] });
      wx.showToast({ title: '加载相框失败', icon: 'none' });
    }
  },

  selectTemplate(e) {
    const template = e.currentTarget.dataset.template;
    this.setData({ selectedTemplate: template });
  },

  async confirmOrder() {
    const { selectedTemplate, photoUrls } = this.data;
    if (!selectedTemplate) {
      wx.showToast({ title: "请选择相框款式", icon: "none" });
      return;
    }
    if (!photoUrls.length) {
      wx.showToast({ title: "未选择照片", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: "生成订单中...", mask: true });

    try {
      const photoUrl = await resolvePhotoForOrder(photoUrls[0]);
      await callOrderApi('create', {
        orderType: 'frame',
        frameTemplateId: selectedTemplate.id,
        frameName: selectedTemplate.name,
        photoUrl,
        styleId: '',
        styleName: '',
        customerId: app.globalData.selectedCustomerId || null
      });

      app.globalData.ordersNeedRefresh = true;
      wx.switchTab({ url: '/pages/order-list/order-list' });
    } catch (err) {
      console.error("调用云函数失败:", err);
      wx.showToast({
        title: err.message || "订单生成失败，请重试",
        icon: "none",
        duration: 2000
      });
    } finally {
      this.setData({ submitting: false });
      wx.hideLoading();
    }
  }
});