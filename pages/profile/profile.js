/**
 * @file 门店管理页面（我的）
 * @description 门店信息、余额、套餐、订单统计、打卡统计
 */

const app = getApp();

// 内置日期工具函数
const formatDate = (date, pattern = "yyyy-MM-dd") => {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return pattern.replace("yyyy", year).replace("MM", month).replace("dd", day);
};

const getCurrentMonthStart = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};

const getCurrentDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

Page({
  data: {
    storeInfo: {},
    dateRange: {
      startDate: getCurrentMonthStart(),
      endDate: getCurrentDate()
    },
    stats: {
      totalAmount: 0,
      frameCount: 0,
      albumCount: 0,
      videoCount: 0,
      memoirCount: 0
    },
    checkinStats: {
      yesterdayCount: 0,
      todayCount: 0,
      todayUnchecked: 0
    },
    refreshing: false,
    packageProgress: 0,   // 本月已用人次百分比
    expireDays: 0,        // 套餐到期剩余天数
    expireProgress: 0     // 到期进度（暂用于样式，可自定义）
  },

  onLoad() {
    this.loadStoreInfo();
    this.loadOrderStats();
    this.loadCheckinStats();
  },

  async loadStoreInfo() {
    const storeId = app.globalData.storeId;
    if (!storeId) {
      console.error("storeId为空");
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection("store_profile").doc(storeId).get();
      const info = res.data;
      // 计算套餐进度
      let progress = 0;
      if (info.packageTotal && info.packageTotal > 0) {
        progress = Math.min(100, Math.floor((info.packageUsed / info.packageTotal) * 100));
      }
      // 计算到期剩余天数
      let expireDays = 0;
      let expireProgress = 0;
      if (info.packageExpireDate) {
        const expireDate = new Date(info.packageExpireDate);
        const today = new Date();
        const diffTime = expireDate - today;
        expireDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        // 假设套餐周期为30天，计算进度（可选）
        // 如果套餐已过期，进度为100%
        if (expireDays <= 0) expireProgress = 100;
        else expireProgress = Math.min(100, Math.floor(((30 - expireDays) / 30) * 100));
      }
      this.setData({
        storeInfo: info,
        packageProgress: progress,
        expireDays: expireDays,
        expireProgress: expireProgress
      });
    } catch (error) {
      console.error("加载门店信息失败:", error);
    }
  },

  async loadOrderStats() {
    const { startDate, endDate } = this.data.dateRange;
    try {
      // 调用云函数获取统计数据
      const res = await wx.cloud.callFunction({
        name: "getOrderStats",
        data: { startDate, endDate }
      });
      if (res.result) {
        // 映射字段：设计稿需要四个品类，实际可根据订单中的商品类型分类
        // 这里假设云函数返回 frameCount, albumCount, videoCount, memoirCount
        this.setData({ stats: res.result });
      } else {
        // 降级模拟数据，防止空值
        this.setData({ stats: { totalAmount: 0, frameCount: 0, albumCount: 0, videoCount: 0, memoirCount: 0 } });
      }
    } catch (error) {
      console.error("加载订单统计失败:", error);
      this.setData({ stats: { totalAmount: 0, frameCount: 0, albumCount: 0, videoCount: 0, memoirCount: 0 } });
    }
  },

  async loadCheckinStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: "getCheckinStats",
        data: { storeId: app.globalData.storeId }
      });
      if (res.result) {
        this.setData({ checkinStats: res.result });
      } else {
        this.setData({ checkinStats: { yesterdayCount: 0, todayCount: 0, todayUnchecked: 0 } });
      }
    } catch (error) {
      console.error("加载打卡统计失败:", error);
      this.setData({ checkinStats: { yesterdayCount: 0, todayCount: 0, todayUnchecked: 0 } });
    }
  },

  // 切换统计周期（这里简单重新加载当月数据）
  onDateRangeChange() {
    // 可改为弹出日期选择器，此处简化为刷新
    this.setData({
      dateRange: { startDate: getCurrentMonthStart(), endDate: getCurrentDate() }
    });
    this.loadOrderStats();
  },

  // 查看昨日未打卡名单
  onViewUncheckedYesterday() {
    wx.navigateTo({
      url: `/pages/profile/unchecked-list/unchecked-list?date=${this.getYesterdayDate()}&type=yesterday`
    });
  },

  // 查看今日已打卡名单
  onViewCheckedToday() {
    wx.navigateTo({
      url: `/pages/profile/unchecked-list/unchecked-list?date=${getCurrentDate()}&type=checked`
    });
  },

  // 查看今日未打卡名单
  onViewUncheckedToday() {
    wx.navigateTo({
      url: `/pages/profile/unchecked-list/unchecked-list?date=${getCurrentDate()}&type=unchecked`
    });
  },

  getYesterdayDate() {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return formatDate(date, "yyyy-MM-dd");
  },

  // 编辑门店信息
  previewStoreAvatar() {
    const url = this.data.storeInfo?.avatarUrl;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  // 初始化测试客户数据（开发调试用）
  async onInitTestData() {
    wx.showLoading({ title: '插入中...' });
    try {
      const res = await wx.cloud.callFunction({ name: 'initTestData' });
      wx.hideLoading();
      console.log('[initTestData] result:', res);
      if (res.result && res.result.success) {
        wx.showToast({ title: res.result.message, icon: 'none' });
      } else {
        wx.showToast({ title: res.result?.message || res.errMsg || '失败', icon: 'none', duration: 3000 });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('[initTestData] error:', err);
      wx.showToast({ title: err.message || err.errMsg || '云函数调用失败', icon: 'none', duration: 3000 });
    }
  },

  onEditStore() {
    wx.navigateTo({
      url: "/pages/profile/edit-store/edit-store",
      fail: (err) => {
        console.error("导航到编辑页面失败:", err);
        const msg = (err && (err.errMsg || err.message)) ? String(err.errMsg || err.message) : "未知错误";
        wx.showToast({ title: msg.length > 20 ? "页面打开失败" : msg, icon: "none", duration: 3000 });
      },
    });
  },

  // 充值/升级会员
  onRecharge() {
    wx.navigateTo({ url: "/pages/profile/recharge/recharge" });
  },

  // 查看全部客户（打卡详情页）
  onViewAllCustomers() {
    wx.navigateTo({ url: "/pages/profile/customer-list/customer-list?selectMode=false" });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ refreshing: true });
    Promise.all([this.loadStoreInfo(), this.loadOrderStats(), this.loadCheckinStats()])
      .finally(() => {
        this.setData({ refreshing: false });
        wx.stopPullDownRefresh();
      });
  }
});