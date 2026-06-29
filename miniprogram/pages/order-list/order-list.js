/**
 * @file 订单列表
 * @description 展示相框订单，按生成时间倒序排列，支持按状态筛选、月份分组、统计概览
 */

const app = getApp();
const { callOrderApi } = require('../../utils/orderApi');
const { redirectCustomerIfNeeded } = require('../../utils/storeGuard');
const { syncStoreTabBar } = require('../../utils/storeTabBar');
const { getCustomerDisplayName } = require('../../utils/customerDisplay');
const { isValidStoreId, resolveSessionIfNeeded } = require('../../utils/storeSession');

const { buildOrderCardThumb } = require('../../utils/orderCardThumb');
const { parseCloudDate } = require('../../utils/cloudDate');
const { copyTextToClipboard } = require('../../utils/clipboard');

const formatDate = (date, pattern = "yyyy-MM-dd") => {
  if (!date) return "";
  const d = parseCloudDate(date);
  if (!d || Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return pattern
    .replace("yyyy", year)
    .replace("MM", month)
    .replace("dd", day)
    .replace("HH", hour)
    .replace("mm", minute);
};

Page({
  behaviors: [require('../../behaviors/pageShare')],
  data: {
    tabs: [
      { status: "all", name: "全部", count: 0 },
      { status: "pending", name: "待处理", count: 0 },
      { status: "producing", name: "制作中", count: 0 },
      { status: "shipped", name: "已发货", count: 0 },
      { status: "done", name: "已完成", count: 0 }
    ],
    currentTab: "all",
    orderGroups: [],       // 按月份分组的订单数据 [{ month, totalAmount, orders }]
    allOrders: [],
    loading: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    refreshing: false,
    allowRefresh: false,
    // 统计概览数据
    monthOrderCount: 0,
    monthCompare: "",
    categoryCount: {
      frame: 0,
      album: 0,
      photo: 0,
      other: 0
    }
  },

  onShow() {
    redirectCustomerIfNeeded().then((redirected) => {
      if (redirected) return;
      this._onShowStoreOrders();
    });
  },

  async _onShowStoreOrders() {
    syncStoreTabBar(this);
    const ready = await this.ensureStoreReady();
    if (!ready) return;

    if (app.globalData.ordersNeedRefresh) {
      app.globalData.ordersNeedRefresh = false;
    }
    // 订单 Tab 展示全店订单，不按首页「关联客户」过滤
    await this.refreshData();
    this._initialLoaded = true;
    this.setData({ allowRefresh: true });
  },

  async ensureStoreReady() {
    await resolveSessionIfNeeded(app);
    if (!isValidStoreId(app.globalData.storeId)) {
      const { reLaunchLaunch } = require('../../utils/sessionDirty');
      reLaunchLaunch();
      return false;
    }
    return true;
  },

  async loadOrders(isLoadMore = false) {
    const loadMore = isLoadMore === true;
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const page = loadMore ? this.data.currentPage + 1 : 1;
      const query = {
        statusTab: this.data.currentTab,
        page,
        pageSize: this.data.pageSize
      };
      const [frameRes, albumRes] = await Promise.all([
        callOrderApi('list', { ...query, orderType: 'frame' }),
        callOrderApi('list', { ...query, orderType: 'album' }).catch(() => ({ list: [] }))
      ]);
      const list = [...(frameRes.list || []), ...(albumRes.list || [])].sort((a, b) => {
        const ta = new Date(a.createTime).getTime();
        const tb = new Date(b.createTime).getTime();
        return tb - ta;
      });
      const hasMore = !!(frameRes.hasMore || albumRes.hasMore);

      const formattedOrders = this.formatOrders(list);
      await this.updateTabCounts();

      const prev = this.data.allOrders || [];
      const allOrders = loadMore ? [...prev, ...formattedOrders] : formattedOrders;
      this.setData({ allOrders });

      const groups = this.groupOrdersByMonth(allOrders);
      this.setData({
        orderGroups: groups,
        hasMore,
        currentPage: page
      });

      this.calculateStats(groups);
    } catch (error) {
      console.error('加载订单失败:', error);
      const msg = (error && error.message) || '加载失败';
      if (!this._loginRetried && /未登录|login/i.test(msg)) {
        this._loginRetried = true;
        await app.ensureLogin();
        return this.loadOrders(isLoadMore);
      }
      wx.showToast({ title: msg, icon: 'none' });
      throw error;
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  async updateTabCounts() {
    try {
      const [frameRes, albumRes] = await Promise.all([
        callOrderApi('countByStatus', { orderType: 'frame' }),
        callOrderApi('countByStatus', { orderType: 'album' }).catch(() => ({ counts: {} }))
      ]);
      const frameCounts = frameRes.counts || {};
      const albumCounts = albumRes.counts || {};
      const tabs = this.data.tabs.map((tab) => ({
        ...tab,
        count: (frameCounts[tab.status] ?? 0) + (albumCounts[tab.status] ?? 0)
      }));
      this.setData({ tabs });
    } catch (err) {
      console.error('更新Tab计数失败', err);
    }
  },

  formatOrders(orders) {
    if (!orders || !orders.length) return [];
    return orders.map(order => {
      const customerInfo = order.customerInfo || null;
      // 状态样式映射
      let statusClass = "";
      let statusText = order.status;
      switch (order.status) {
        case "待处理": statusClass = "pending"; break;
        case "制作中": statusClass = "producing"; break;
        case "已发货": statusClass = "shipped"; break;
        case "已完成": statusClass = "done"; break;
        default: statusClass = "pending";
      }
      const legacyPhoto = Array.isArray(order.photos) ? order.photos[0] : '';
      const thumbMeta = buildOrderCardThumb(order);
      return {
        ...order,
        createTimeStr: formatDate(order.createTime, "MM-dd HH:mm"),
        customerInfo,
        displayCustomerName: getCustomerDisplayName(customerInfo),
        photoThumb: thumbMeta.photoThumb,
        thumbVariant: thumbMeta.thumbVariant,
        thumbLabel: thumbMeta.thumbLabel,
        orderType: thumbMeta.orderType,
        statusClass,
        statusText,
        showConfirmProduction: statusClass === 'pending',
        showViewLogistics: statusClass === 'producing',
        showConfirmReceipt: statusClass === 'shipped'
      };
    });
  },

  groupOrdersByMonth(orders) {
    const groupsMap = new Map();
    orders.forEach(order => {
      const date = parseCloudDate(order.createTime) || new Date();
      const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      if (!groupsMap.has(monthKey)) {
        groupsMap.set(monthKey, { month: monthKey, totalCount: 0, orders: [] });
      }
      const group = groupsMap.get(monthKey);
      group.totalCount += 1;
      group.orders.push(order);
    });
    // 按月份倒序
    const sorted = Array.from(groupsMap.values()).sort((a, b) => {
      const aNum = a.month.replace("年", "").replace("月", "");
      const bNum = b.month.replace("年", "").replace("月", "");
      return bNum.localeCompare(aNum);
    });
    return sorted;
  },

  calculateStats(groups) {
    // 获取当前月份（取第一个分组或当前系统月份）
    const now = new Date();
    const currentMonth = `${now.getFullYear()}年${now.getMonth() + 1}月`;
    const currentGroup = groups.find(g => g.month === currentMonth);
    const monthOrderCount = currentGroup ? currentGroup.totalCount : 0;
    let frameCount = 0, albumCount = 0, photoCount = 0, otherCount = 0;
    const allOrders = groups.flatMap(g => g.orders);
    allOrders.forEach(order => {
      const name = order.frameName || '';
      const style = order.styleName || '';
      if (name.includes('相框') || name.includes('摆台') || style) frameCount++;
      else if (name.includes('写真集') || name.includes('相册')) albumCount++;
      else if (name.includes('精修') || name.includes('照片')) photoCount++;
      else otherCount++;
    });
    this.setData({
      monthOrderCount,
      categoryCount: {
        frame: frameCount,
        album: albumCount,
        photo: photoCount,
        other: otherCount
      }
    });
  },

  switchTab(e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.currentTab) return;
    this.setData({
      currentTab: status,
      orderGroups: [],
      hasMore: true,
      currentPage: 0,
      allOrders: []
    });
    this.loadOrders();
  },

  stopActionBubble() {},

  async onCopyOrderNo(e) {
    const orderNo = e.currentTarget.dataset.orderno;
    await copyTextToClipboard(orderNo, {
      emptyToast: '暂无订单号',
      successToast: '已复制订单号',
    });
  },

  buildOrderDetailUrl(order, extra = {}) {
    if (!order || !order._id) return '';
    const orderType = order.orderType || 'frame';
    const parts = [`orderId=${order._id}`, `orderType=${orderType}`];
    if (extra.scrollTo) parts.push(`scrollTo=${extra.scrollTo}`);
    return `/packageStore/pages/order/order-detail/order-detail?${parts.join('&')}`;
  },

  onOrderDetail(e) {
    const order = e.currentTarget.dataset.order;
    const url = this.buildOrderDetailUrl(order);
    if (!url) return;
    wx.navigateTo({ url });
  },

  onViewLogistics(e) {
    const order = e.currentTarget.dataset.order;
    if (!order || !order._id) return;
    const scrollTo = order.shippingNo || order.status === '已发货' ? 'logistics' : '';
    wx.navigateTo({
      url: this.buildOrderDetailUrl(order, scrollTo ? { scrollTo } : {})
    });
  },

  onConfirmProduction(e) {
    const order = e.currentTarget.dataset.order;
    wx.showModal({
      title: "确认制作",
      content: "开始制作该订单？",
      success: async (res) => {
        if (res.confirm) {
          await callOrderApi('updateStatus', {
            orderType: order.orderType || 'frame',
            orderId: order._id,
            status: '制作中'
          });
          wx.showToast({ title: '已开始制作', icon: 'success' });
          this.refreshData();
        }
      }
    });
  },

  onConfirmReceipt(e) {
    const order = e.currentTarget.dataset.order;
    wx.showModal({
      title: "确认签收",
      content: "确认客户已收到商品？",
      success: async (res) => {
        if (res.confirm) {
          await callOrderApi('updateStatus', {
            orderType: order.orderType || 'frame',
            orderId: order._id,
            status: '已完成'
          });
          wx.showToast({ title: '已确认签收', icon: 'success' });
          this.refreshData();
        }
      }
    });
  },

  refreshData() {
    this.setData({
      orderGroups: [],
      hasMore: true,
      currentPage: 0,
      allOrders: []
    });
    return this.loadOrders(false);
  },

  /** scroll-view 下拉刷新（勿与 loadOrders 参数混用：refresher 会传入 event） */
  onScrollRefresh() {
    if (!this.data.allowRefresh) {
      this.setData({ refreshing: false });
      return;
    }
    this.setData({ refreshing: true });
    this.refreshData()
      .catch(() => {})
      .finally(() => {
        this.setData({ refreshing: false });
        wx.stopPullDownRefresh();
      });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(true);
    }
  }
});