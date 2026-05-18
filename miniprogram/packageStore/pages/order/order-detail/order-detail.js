/**
 * @file 订单详情页
 */

const app = getApp();
const { callOrderApi } = require('../../../../utils/orderApi');
const { getCustomerDisplayName } = require('../../../../utils/customerDisplay');
const { fetchPlatformSupportPhone } = require('../../../../utils/platformSettings');

const PLACEHOLDER_THUMB = '/assets/icons/album-placeholder.png';
const STATUS_FLOW = ['待处理', '制作中', '已发货', '已完成'];
const LOGISTICS_COMPANY = '顺丰速运';

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function maskPhone(phone) {
  const p = String(phone || '').trim();
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(-4)}`;
  return p;
}

/** 首期无快递 API：有运单号时展示占位轨迹 */
/** 已激活的门店成员（owner/staff）；页面复用时非门店账号不展示「联系平台」 */
function isStoreStaffAccount() {
  const m = app.globalData.membership;
  return !!(m && m.canUseStore === true && m.status === 'active');
}

function buildLogisticsTraces(status, shippingNo) {
  if (!shippingNo) return [];
  if (status === '已完成') {
    return [
      {
        time: '05-17 11:32',
        msg: '已签收，感谢使用顺丰速运',
        active: true
      }
    ];
  }
  if (status === '已发货') {
    return [
      {
        time: '05-16 18:20',
        msg: '【杭州市】快件已到达 西湖区营业部，正在派送中',
        active: true
      },
      {
        time: '05-16 09:15',
        msg: '【杭州市】快件已从 萧山转运中心 发出',
        active: false
      },
      {
        time: '05-15 20:40',
        msg: '商家已发货，等待揽收',
        active: false
      }
    ];
  }
  return [];
}

function buildViewModel(order, isStoreStaff) {
  const status = order.status || '待处理';
  const stepIndex = Math.max(0, STATUS_FLOW.indexOf(status));
  const legacyPhoto = Array.isArray(order.photos) ? order.photos[0] : '';
  const photoUrl = order.photoUrl || legacyPhoto || '';
  const customer = order.customerInfo || null;
  const shippingNo = (order.shippingNo || '').trim();
  const traces = buildLogisticsTraces(status, shippingNo);
  const latestTrace = traces[0];

  const steps = STATUS_FLOW.map((label, i) => ({
    label,
    done: status === '已完成' ? true : i < stepIndex,
    active: status === '已完成' ? false : i === stepIndex
  }));

  const trackPercents = ['0%', '33%', '66%', '100%'];
  const trackWidth = trackPercents[stepIndex] || '0%';

  let heroClass = '';
  let heroTitle = '';
  let heroSub = '';
  let logisticsBeforePreview = false;
  let showLogisticsStrip = false;
  let logisticsMode = 'empty';
  let logisticsEmptyIcon = '📦';
  let logisticsEmptyTitle = '';
  let logisticsEmptySub = '';
  let showCopyShipping = false;

  switch (status) {
    case '待处理':
      heroClass = 'pending-bg';
      heroTitle = '待店长确认制作';
      heroSub = '确认后将扣减摆台次数并开始制作，预计 3–5 个工作日';
      logisticsMode = 'empty';
      logisticsEmptyIcon = '📦';
      logisticsEmptyTitle = '确认制作后进入生产流程';
      logisticsEmptySub = '发货后将在此展示物流轨迹';
      break;
    case '制作中':
      heroTitle = '工厂制作中';
      heroSub = '正在冲印与装裱，完成后将录入快递单号并通知您';
      logisticsMode = 'empty';
      logisticsEmptyIcon = '🏭';
      logisticsEmptyTitle = '制作中，暂未发货';
      logisticsEmptySub = '有运单号后将自动更新，如有疑问可联系平台';
      break;
    case '已发货':
      heroClass = 'shipped-bg';
      heroTitle = '包裹运输中';
      heroSub = shippingNo
        ? `${LOGISTICS_COMPANY} ${shippingNo} · 预计 3 天内送达`
        : '已发货，物流信息更新中';
      logisticsBeforePreview = true;
      showLogisticsStrip = !!shippingNo;
      logisticsMode = shippingNo ? 'timeline' : 'empty';
      showCopyShipping = !!shippingNo;
      if (!shippingNo) {
        logisticsEmptyIcon = '🚚';
        logisticsEmptyTitle = '已发货，待录入运单号';
        logisticsEmptySub = '请联系客服或稍后再查看';
      }
      break;
    case '已完成':
      heroTitle = '订单已完成';
      heroSub = shippingNo
        ? `${shippingNo} 已签收`
        : '感谢使用，欢迎带客户再次体验 AI 写真摆台';
      logisticsMode = shippingNo ? 'done' : 'empty';
      showCopyShipping = !!shippingNo;
      if (!shippingNo) {
        logisticsEmptyIcon = '✓';
        logisticsEmptyTitle = '订单已完成';
        logisticsEmptySub = '本单无物流记录';
      }
      break;
    default:
      heroTitle = status;
      heroSub = '';
  }

  const wxNick = (customer?.wxNickName || '').trim();
  const phoneMasked = maskPhone(customer?.phone);
  let customerDesc = '';
  if (wxNick && phoneMasked) customerDesc = `微信：${wxNick} · ${phoneMasked}`;
  else if (wxNick) customerDesc = `微信：${wxNick}`;
  else if (phoneMasked) customerDesc = phoneMasked;

  const updateTime = order.updateTime || order.createTime;

  return {
    ...order,
    photoUrl: photoUrl || PLACEHOLDER_THUMB,
    createTimeStr: formatDateTime(order.createTime),
    updateTimeStr: formatDateTime(updateTime),
    showUpdateTime: status !== '待处理',
    storeName: app.globalData.storeName || '当前门店',
    displayCustomerName: getCustomerDisplayName(customer),
    customerDesc,
    customerAvatar: customer?.avatarUrl || '',
    hasCustomer: !!order.customerId,
    heroClass,
    heroTitle,
    heroSub,
    steps,
    trackWidth,
    logisticsBeforePreview,
    showLogisticsStrip,
    stripLatest: latestTrace?.msg || '',
    stripMeta: shippingNo
      ? `${LOGISTICS_COMPANY} ${shippingNo}${latestTrace?.time ? ` · ${latestTrace.time}` : ''}`
      : '',
    logisticsMode,
    logisticsEmptyIcon,
    logisticsEmptyTitle,
    logisticsEmptySub,
    logisticsCompany: LOGISTICS_COMPANY,
    shippingNo,
    traces,
    showConfirmProduction: status === '待处理',
    showViewLogistics: status === '制作中',
    showConfirmReceipt: status === '已发货',
    showPrimaryAction: isStoreStaff && status !== '已完成',
    showCopyShipping,
    showGhostCopy: !!showCopyShipping,
    showContactPlatform: isStoreStaff && !showCopyShipping,
    showBottomGhost: !!showCopyShipping || (isStoreStaff && !showCopyShipping),
    showBottomBar:
      !!showCopyShipping ||
      (isStoreStaff && !showCopyShipping) ||
      (isStoreStaff && status !== '已完成'),
    primaryBtnText:
      status === '待处理'
        ? '确认制作'
        : status === '制作中'
          ? '查看物流'
          : status === '已发货'
            ? '确认签收'
            : '',
    primaryBtnClass:
      status === '待处理' ? 'orange' : status === '已发货' ? 'green' : ''
  };
}

Page({
  data: {
    orderId: '',
    scrollIntoView: '',
    loading: true,
    view: null,
    platformSupportPhone: ''
  },

  onLoad(options) {
    const orderId = options.orderId || '';
    if (!orderId) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }
    const scrollIntoView = options.scrollTo === 'logistics' ? 'logistics-anchor' : '';
    this.setData({ orderId, scrollIntoView });
    this.loadPlatformPhone();
    this.loadOrderDetail();
  },

  async loadPlatformPhone() {
    if (!isStoreStaffAccount()) return;
    const phone = await fetchPlatformSupportPhone();
    this.setData({ platformSupportPhone: phone });
  },

  async loadOrderDetail() {
    this.setData({ loading: true });
    try {
      const { order } = await callOrderApi('get', {
        orderType: 'frame',
        orderId: this.data.orderId
      });
      const isStoreStaff = isStoreStaffAccount();
      this.setData({
        view: buildViewModel(order, isStoreStaff),
        loading: false
      });
    } catch (error) {
      console.error('加载订单详情失败:', error);
      this.setData({ loading: false, view: null });
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  onPullDownRefresh() {
    Promise.all([
      this.loadPlatformPhone(),
      this.loadOrderDetail()
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

  onCopyOrderNo() {
    const no = this.data.view?.orderNo;
    if (!no) return;
    wx.setClipboardData({
      data: no,
      success: () => wx.showToast({ title: '已复制订单号', icon: 'success' })
    });
  },

  onCopyShippingNo() {
    const no = this.data.view?.shippingNo;
    if (!no) {
      wx.showToast({ title: '暂无运单号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: no,
      success: () => wx.showToast({ title: '已复制运单号', icon: 'success' })
    });
  },

  onScrollToLogistics() {
    this.setData({ scrollIntoView: 'logistics-anchor' });
  },

  onCustomerTap() {
    const customerId = this.data.view?.customerId;
    if (!customerId) return;
    wx.navigateTo({
      url: `/packageStore/pages/profile/customer-edit/customer-edit?id=${customerId}`
    });
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

  /** 门店端：展示平台电话（后台配置），可拨打 */
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
      wx.showModal({
        title: '物流信息',
        content: `运单号：${view.shippingNo}\n物流公司：${LOGISTICS_COMPANY}\n${view.stripLatest || '运输中，请稍后查询最新状态'}`,
        showCancel: false
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
            orderType: 'frame',
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
            orderType: 'frame',
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
