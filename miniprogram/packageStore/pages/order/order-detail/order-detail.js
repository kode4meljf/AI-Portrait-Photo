/**
 * @file 订单详情页
 */

const app = getApp();
const { callOrderApi } = require('../../../../utils/orderApi');
const { fetchPlatformSupportPhone } = require('../../../../utils/platformSettings');
const { copyTextToClipboard } = require('../../../utils/clipboard');
const { buildFrameOrderView, PLACEHOLDER_THUMB, shouldQueryLogistics } = require('../../../utils/frameOrderDetailView');
const { buildAlbumOrderView } = require('../../../utils/albumOrderDetailView');
const { resolveOrderType } = require('../../../../utils/orderCardThumb');

function normalizeOrderType(value) {
  return value === 'album' ? 'album' : 'frame';
}

/** 已激活的门店成员（owner/staff）；页面复用时非门店账号不展示「联系平台」 */
function isStoreStaffAccount() {
  const m = app.globalData.membership;
  return !!(m && m.canUseStore === true && m.status === 'active');
}

Page({
  behaviors: [require('../../../../behaviors/pageShare')],
  data: {
    orderId: '',
    orderType: 'frame',
    scrollIntoView: '',
    scrollViewHeight: 600,
    loading: true,
    view: null,
    platformSupportPhone: ''
  },

  _orderRaw: null,
  _viewOptions: null,

  onLoad(options) {
    const orderId = options.orderId || '';
    if (!orderId) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }
    const scrollIntoView = options.scrollTo === 'logistics' ? 'logistics-anchor' : '';
    const orderType = normalizeOrderType(options.orderType);
    this.setData({ orderId, orderType, scrollIntoView });
    this.updateScrollViewHeight();
    this.loadPlatformPhone();
    this.loadOrderDetail();
  },

  onReady() {
    this.updateScrollViewHeight();
  },

  updateScrollViewHeight() {
    const sys = wx.getWindowInfo();
    const h = sys.windowHeight || 600;
    if (h !== this.data.scrollViewHeight) {
      this.setData({ scrollViewHeight: h });
    }
  },

  async loadPlatformPhone() {
    if (!isStoreStaffAccount()) return;
    const phone = await fetchPlatformSupportPhone();
    this.setData({ platformSupportPhone: phone });
  },

  buildView(order, extra = {}) {
    const opts = { ...(this._viewOptions || {}), ...extra };
    const orderType = resolveOrderType(order) || this.data.orderType;
    if (orderType === 'album') return buildAlbumOrderView(order, opts);
    return buildFrameOrderView(order, opts);
  },

  async loadOrderDetail(skipLogistics = false) {
    this.setData({ loading: true });
    try {
      const { order } = await callOrderApi('get', {
        orderType: this.data.orderType,
        orderId: this.data.orderId
      });
      const orderType = resolveOrderType(order);
      const isStoreStaff = isStoreStaffAccount();
      this._orderRaw = order;
      this._viewOptions = {
        isStoreStaff,
        audience: 'store',
        storeName: app.globalData.storeName || '当前门店'
      };
      const view = this.buildView(order);
      this.setData({
        orderType,
        view,
        loading: false
      });
      this.updateScrollViewHeight();
      if (!skipLogistics && shouldQueryLogistics(order)) {
        this.loadLogistics(false);
      }
    } catch (error) {
      console.error('加载订单详情失败:', error);
      this.setData({ loading: false, view: null });
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  async loadLogistics(force = false) {
    if (!this._orderRaw || !shouldQueryLogistics(this._orderRaw)) return;
    this.setData({ view: this.buildView(this._orderRaw, { logisticsLoading: true }) });
    try {
      const { logistics } = await callOrderApi('getLogistics', {
        orderType: this.data.orderType,
        orderId: this.data.orderId,
        force
      });
      if (logistics?.companyName) {
        this._orderRaw = {
          ...this._orderRaw,
          shippingCompanyName: logistics.companyName,
          shippingCom: logistics.companyCode || this._orderRaw.shippingCom
        };
      }
      this.setData({ view: this.buildView(this._orderRaw, { logistics }) });
    } catch (error) {
      console.warn('查询物流失败:', error);
      this.setData({
        view: this.buildView(this._orderRaw, {
          logistics: {
            empty: true,
            message: error.message || '物流信息查询失败，请稍后重试',
            traces: []
          }
        })
      });
    }
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadPlatformPhone(),
      this.loadOrderDetail(true).then(() => {
        if (this._orderRaw && shouldQueryLogistics(this._orderRaw)) {
          return this.loadLogistics(true);
        }
      })
    ]).finally(() => wx.stopPullDownRefresh());
  },

  previewImage() {
    const url = this.data.view?.photoUrl;
    if (!url || url === PLACEHOLDER_THUMB) {
      wx.showToast({ title: '暂无成片', icon: 'none' });
      return;
    }
    wx.previewImage({ urls: [url], current: url });
  },

  previewAlbumPhotos(e) {
    const urls = this.data.view?.photoUrls || [];
    if (!urls.length) {
      wx.showToast({ title: '暂无入选写真', icon: 'none' });
      return;
    }
    const index = Number(e.currentTarget.dataset.index || 0);
    const current = urls[index] || urls[0];
    wx.previewImage({ urls, current });
  },

  async onCopyOrderNo() {
    await copyTextToClipboard(this.data.view?.orderNo, {
      emptyToast: '暂无订单号',
      successToast: '已复制订单号'
    });
  },

  async onCopyShippingNo() {
    await copyTextToClipboard(this.data.view?.shippingNo, {
      emptyToast: '暂无运单号',
      successToast: '已复制运单号'
    });
  },

  onScrollToLogistics() {
    this.setData({ scrollIntoView: 'logistics-anchor' });
  },

  onGhostAction() {
    const view = this.data.view;
    if (!view) return;
    if (view.showGhostCopy) {
      this.onCopyShippingNo();
      return;
    }
    if (view.showContactPlatform) {
      this.onContactPlatform();
    }
  },

  async onContactPlatform() {
    if (!isStoreStaffAccount()) return;
    let phone = (this.data.platformSupportPhone || '').trim();
    if (!phone) {
      phone = await fetchPlatformSupportPhone(true);
      this.setData({ platformSupportPhone: phone });
    }
    if (!phone) {
      wx.showToast({ title: '暂未配置平台电话', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '联系平台',
      content: `平台客服电话：${phone}`,
      confirmText: '拨打',
      cancelText: '关闭',
      success: (res) => {
        if (!res.confirm) return;
        const dial = String(phone).replace(/\D/g, '');
        if (!dial) {
          wx.showToast({ title: '号码无效', icon: 'none' });
          return;
        }
        wx.makePhoneCall({ phoneNumber: dial });
      }
    });
  },

  onViewLogistics() {
    const view = this.data.view;
    if (!view) return;
    if (view.shippingNo) {
      const latest = view.stripLatest || '暂无物流信息';
      wx.showModal({
        title: '物流信息',
        content: `运单号：${view.shippingNo}\n快递公司：${view.logisticsCompany || '快递公司'}\n\n${latest}`,
        confirmText: '复制单号',
        cancelText: '关闭',
        success: (res) => {
          if (res.confirm) this.onCopyShippingNo();
        }
      });
      return;
    }
    wx.showToast({ title: '暂无物流信息', icon: 'none' });
  },

  onConfirmProduction() {
    const orderId = this.data.orderId;
    wx.showModal({
      title: '确认制作',
      content: '开始制作该订单？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await callOrderApi('updateStatus', {
            orderType: this.data.orderType,
            orderId,
            status: '制作中'
          });
          wx.showToast({ title: '已开始制作', icon: 'success' });
          this.loadOrderDetail();
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  onConfirmReceipt() {
    const orderId = this.data.orderId;
    wx.showModal({
      title: '确认签收',
      content: '确认客户已收到商品？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await callOrderApi('updateStatus', {
            orderType: this.data.orderType,
            orderId,
            status: '已完成'
          });
          wx.showToast({ title: '已确认签收', icon: 'success' });
          this.loadOrderDetail();
        } catch (e) {
          wx.showToast({ title: e.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  onPrimaryAction() {
    const view = this.data.view;
    if (!view) return;
    if (view.showConfirmProduction) this.onConfirmProduction();
    else if (view.showViewLogistics) this.onViewLogistics();
    else if (view.showConfirmReceipt) this.onConfirmReceipt();
  }
});
