/**
 * @file 客户列表页面
 * @description 展示客户列表，支持搜索和选择客户
 */

const app = getApp();

Page({
  data: {
    selectMode: false,      // 是否为选择模式
    customers: [],
    searchKeyword: "",
    loading: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0
  },

  onLoad(options) {
    this.setData({ selectMode: options.selectMode === "true" });
    this.loadCustomers();
  },

  async loadCustomers(isLoadMore = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      let query = db.collection("customers")
        .where({ storeId: app.globalData.storeId });

      if (this.data.searchKeyword) {
        // 模糊搜索昵称或手机号
        const _ = db.command;
        query = query.where(
          _.or([
            { nickName: db.RegExp({ regexp: this.data.searchKeyword, options: "i" }) },
            { phone: db.RegExp({ regexp: this.data.searchKeyword, options: "i" }) }
          ])
        );
      }

      const skip = isLoadMore ? this.data.currentPage * this.data.pageSize : 0;
      const res = await query
        .orderBy("createTime", "desc")
        .skip(skip)
        .limit(this.data.pageSize)
        .get();

      const customers = res.data.map(c => ({
        ...c,
        createTimeStr: this.formatDate(c.createTime)
      }));

      const allCustomers = isLoadMore ? [...this.data.customers, ...customers] : customers;

      this.setData({
        customers: allCustomers,
        hasMore: res.data.length === this.data.pageSize,
        currentPage: isLoadMore ? this.data.currentPage + 1 : 1
      });
    } catch (error) {
      console.error("加载客户列表失败:", error);
    } finally {
      this.setData({ loading: false });
    }
  },

  formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    return `${d.getMonth()+1}/${d.getDate()}`;
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value, customers: [], hasMore: true, currentPage: 0 });
    this.loadCustomers();
  },

  onCustomerTap(e) {
    const customer = e.currentTarget.dataset.customer;
    if (this.data.selectMode) {
      // 选择客户后返回并更新全局
      app.globalData.selectedCustomerId = customer._id;
      wx.setStorageSync("selectedCustomerId", customer._id);
      wx.navigateBack();
    } else {
      // 查看客户详情（可扩展）
      wx.showToast({ title: "功能开发中", icon: "none" });
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCustomers(true);
    }
  },

  onPullDownRefresh() {
    this.setData({ customers: [], hasMore: true, currentPage: 0 });
    this.loadCustomers();
    wx.stopPullDownRefresh();
  }
});