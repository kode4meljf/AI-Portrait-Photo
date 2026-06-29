/**
 * @file 门店管理页面（我的）
 * @description 门店信息、余额、套餐、订单统计、打卡统计
 */

const app = getApp();
const { isValidStoreId } = require('../../utils/storeSession');
const { getProfileCollection } = require('../../utils/account');
const { safeNavigateTo } = require('../../utils/navigation');
const { redirectCustomerIfNeeded } = require('../../utils/storeGuard');
const { syncStoreTabBar, setStoreTabBarHidden } = require('../../utils/storeTabBar');
const { STORE_BASE } = require('../../utils/helpCenter');
const { isStoreOwner } = require('../../utils/storeRole');
const { getPointsPriceList, formatBalanceDisplay, formatBalanceText, PORTRAIT_POINTS_9, FRAME_POINTS } = require('../../utils/storePoints');
const { callOrderApi } = require('../../utils/orderApi');
const { syncPendingRechargeOrders } = require('../../utils/payApi');
const { parseCloudDate } = require('../../utils/cloudDate');
const { computeDashboardStats, filterOrdersInMonth } = require('../../utils/orderDashboardStats');

const formatDate = (date, pattern = 'yyyy-MM-dd') => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return pattern.replace('yyyy', year).replace('MM', month).replace('dd', day);
};

const getCurrentMonthStart = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

const getCurrentDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const computeUseGrid = (balance) => {
  const b = Math.floor(Number(balance) || 0);
  const shoot9 = Math.floor(b / PORTRAIT_POINTS_9);
  const frames = Math.floor(b / FRAME_POINTS);
  return {
    shoot9,
    frames,
    shoot9Text: formatBalanceText(shoot9),
    frameText: formatBalanceText(frames)
  };
};

Page({
  behaviors: [require('../../behaviors/pageShare')],
  data: {
    storeInfo: {},
    orderStats: {
      monthOrderCount: 0,
      categoryCount: { frame: 0, album: 0, photo: 0, other: 0 }
    },
    checkinStats: {
      yesterdayCount: 0,
      todayCount: 0,
      todayUnchecked: 0
    },
    refreshing: false,
    isOwner: false,
    showPriceModal: false,
    priceModalPageStyle: '',
    priceList: [],
    balanceDisplay: { text: '0', size: 'lg', full: '0', compact: false },
    useGrid: { shoot9: 0, frames: 0, shoot9Text: '0', frameText: '0' }
  },

  onLoad() {
    this.setData({ priceList: getPointsPriceList() });
    this.loadStoreInfo();
    this.loadOrderStats();
    this.loadCheckinStats();
  },

  onShow() {
    redirectCustomerIfNeeded().then((redirected) => {
      if (redirected) return;
      this._onShowStoreProfile();
    });
  },

  _onShowStoreProfile() {
    syncStoreTabBar(this);
    if (!this.data.showPriceModal) {
      setStoreTabBarHidden(this, false);
    }
    this.setData({ isOwner: isStoreOwner(app) });
    if (!isValidStoreId(app.globalData.storeId)) {
      if (!this._relaunching) {
        this._relaunching = true;
        const { reLaunchLaunch } = require('../../utils/sessionDirty');
        reLaunchLaunch({
          complete: () => {
            this._relaunching = false;
          }
        });
      }
      return;
    }
    this.loadStoreInfo();
    this.loadOrderStats();
    this.loadCheckinStats();
    syncPendingRechargeOrders()
      .then(({ credited }) => {
        if (credited > 0) {
          this.loadStoreInfo();
          wx.showToast({ title: `积分到账 +${credited}`, icon: 'success' });
        }
      })
      .catch((err) => {
        console.warn('[profile] syncPendingRechargeOrders', err);
      });
  },

  async loadStoreInfo() {
    const storeId = app.globalData.storeId;
    if (!isValidStoreId(storeId)) {
      console.error('storeId 无效');
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection(getProfileCollection()).doc(storeId).get();
      const info = res.data;

      this.setData({
        storeInfo: info,
        balanceDisplay: formatBalanceDisplay(info.balance),
        useGrid: computeUseGrid(info.balance)
      });
    } catch (error) {
      console.error('加载门店信息失败:', error);
    }
  },

  async loadOrderStats() {
    if (!isValidStoreId(app.globalData.storeId)) return;

    const monthStart = new Date(`${getCurrentMonthStart()}T00:00:00`);
    const collected = [];

    try {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 10) {
        const res = await callOrderApi('list', {
          statusTab: 'all',
          page,
          pageSize: 50
        });
        const list = res.list || [];
        if (!list.length) break;

        collected.push(...list);
        hasMore = !!res.hasMore;

        const oldest = list[list.length - 1];
        const oldestDate = parseCloudDate(oldest && oldest.createTime);
        if (oldestDate && oldestDate.getTime() < monthStart.getTime()) {
          break;
        }
        page += 1;
      }

      const monthOrders = filterOrdersInMonth(collected, monthStart);
      this.setData({ orderStats: computeDashboardStats(monthOrders) });
    } catch (error) {
      console.error('加载订单统计失败:', error);
      this.setData({
        orderStats: {
          monthOrderCount: 0,
          categoryCount: { frame: 0, album: 0, photo: 0, other: 0 }
        }
      });
    }
  },

  async loadCheckinStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'storeStats',
        data: { action: 'checkin', storeId: app.globalData.storeId }
      });
      if (res.result) {
        this.setData({ checkinStats: res.result });
      } else {
        this.setData({ checkinStats: { yesterdayCount: 0, todayCount: 0, todayUnchecked: 0 } });
      }
    } catch (error) {
      console.error('加载打卡统计失败:', error);
      this.setData({ checkinStats: { yesterdayCount: 0, todayCount: 0, todayUnchecked: 0 } });
    }
  },

  onHide() {
    if (this.data.showPriceModal) {
      setStoreTabBarHidden(this, false);
      this.setData({ showPriceModal: false, priceModalPageStyle: '' });
    }
  },

  onUnload() {
    if (this.data.showPriceModal) {
      setStoreTabBarHidden(this, false);
    }
  },

  onViewAllOrders() {
    wx.switchTab({ url: '/pages/order-list/order-list' });
  },

  onOrderCategoryTap(e) {
    const cat = e.currentTarget.dataset.cat;
    if (cat === 'video' || cat === 'memoir') {
      wx.showToast({ title: '即将上线', icon: 'none' });
      return;
    }
    this.onViewAllOrders();
  },

  onViewUncheckedYesterday() {
    wx.navigateTo({
      url: `/packageStore/pages/profile/unchecked-list/unchecked-list?date=${this.getYesterdayDate()}&mode=checked`
    });
  },

  onViewCheckedToday() {
    wx.navigateTo({
      url: `/packageStore/pages/profile/unchecked-list/unchecked-list?date=${getCurrentDate()}&mode=checked`
    });
  },

  onViewUncheckedToday() {
    wx.navigateTo({
      url: `/packageStore/pages/profile/unchecked-list/unchecked-list?date=${getCurrentDate()}&mode=unchecked`
    });
  },

  getYesterdayDate() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return formatDate(date, 'yyyy-MM-dd');
  },

  previewStoreAvatar() {
    const url = this.data.storeInfo?.avatarUrl;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  onEditStore() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '仅店长可编辑门店资料', icon: 'none' });
      return;
    }
    safeNavigateTo({
      url: '/packageStore/pages/profile/edit-store/edit-store',
      fail: (err) => {
        console.error('导航到编辑页面失败:', err);
        const msg = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : '未知错误';
        wx.showToast({ title: msg.length > 20 ? '页面打开失败' : msg, icon: 'none', duration: 3000 });
      }
    });
  },

  onRecharge() {
    safeNavigateTo({ url: '/packageStore/pages/profile/recharge/recharge' });
  },

  onOpenPriceList() {
    setStoreTabBarHidden(this, true);
    this.setData({
      showPriceModal: true,
      priceModalPageStyle: 'overflow:hidden;height:100vh;'
    });
  },

  onBalanceTap() {
    const { compact, full } = this.data.balanceDisplay || {};
    if (compact && full) {
      wx.showToast({ title: `${full} 积分`, icon: 'none', duration: 2000 });
    }
  },

  onClosePriceList() {
    setStoreTabBarHidden(this, false);
    this.setData({
      showPriceModal: false,
      priceModalPageStyle: ''
    });
  },

  onPriceModalTap() {},

  preventMove() {},

  onViewAllCustomers() {
    safeNavigateTo({ url: '/packageStore/pages/profile/customer-list/customer-list?selectMode=false' });
  },

  onManageMembers() {
    safeNavigateTo({ url: '/packageStore/pages/profile/members/members' });
  },

  onCreateCustomer() {
    safeNavigateTo({ url: '/packageStore/pages/profile/customer-create/customer-create' });
  },

  onCustomerInvite() {
    safeNavigateTo({ url: '/packageStore/pages/profile/customer-invite/customer-invite' });
  },

  onOpenHelp() {
    safeNavigateTo({ url: `${STORE_BASE}/index` });
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    Promise.all([this.loadStoreInfo(), this.loadOrderStats(), this.loadCheckinStats()])
      .finally(() => {
        this.setData({ refreshing: false });
        wx.stopPullDownRefresh();
      });
  }
});
