/**
 * @file 客户列表页面
 * @description 展示客户列表，支持搜索和选择客户
 */

const app = getApp();
const { getCustomerDisplayName } = require("../../../../utils/customerDisplay");

Page({
  data: {
    selectMode: false,
    forGallery: false,
    forBatchLink: false,
    linkBatchId: "",
    customers: [],
    searchKeyword: "",
    loading: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0
  },

  onLoad(options) {
    const purpose = options.purpose || options.for;
    this.setData({
      selectMode: options.selectMode === "true",
      forGallery: purpose === "gallery",
      forBatchLink: purpose === "batchLink",
      linkBatchId: options.batchId ? decodeURIComponent(options.batchId) : ""
    });
    if (this.data.forBatchLink) {
      wx.setNavigationBarTitle({ title: "选择客户" });
    }
    this.loadCustomers();
    if (options.seedMock === "true") {
      this.onSeedMockCustomers();
    }
  },

  async loadCustomers(isLoadMore = false) {
    if (this.data.loading) return;
    const storeId = app.globalData.storeId;
    if (!storeId) {
      wx.showToast({ title: "请先登录门店", icon: "none" });
      return;
    }
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      let query = db.collection("customers")
        .where({ storeId });

      if (this.data.searchKeyword) {
        const _ = db.command;
        const kw = this.data.searchKeyword;
        query = db.collection("customers").where(
          _.and([
            { storeId },
            _.or([
              { nickName: db.RegExp({ regexp: kw, options: "i" }) },
              { phone: db.RegExp({ regexp: kw, options: "i" }) }
            ])
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

  async linkBatchToCustomer(batchId, customer) {
    if (!batchId) {
      throw new Error("缺少批次 ID");
    }
    const db = wx.cloud.database();
    const customerId = customer._id;
    const now = Date.now();
    await db.collection("batches").doc(batchId).update({
      data: { customerId, updateTime: now }
    });
    try {
      await db.collection("photos").where({ batchId }).update({
        data: { customerId }
      });
    } catch (err) {
      console.warn("批次照片批量更新 customerId 失败，逐条更新:", err);
      const { data: photos } = await db.collection("photos").where({ batchId }).get();
      await Promise.all(
        photos.map((p) =>
          db.collection("photos").doc(p._id).update({ data: { customerId } })
        )
      );
    }
  },

  onCustomerTap(e) {
    const customer = e.currentTarget.dataset.customer;
    if (this.data.selectMode) {
      if (this.data.forBatchLink && this.data.linkBatchId) {
        wx.showLoading({ title: "关联中..." });
        this.linkBatchToCustomer(this.data.linkBatchId, customer)
          .then(() => {
            wx.hideLoading();
            const name = getCustomerDisplayName(customer);
            app.globalData.pendingGalleryToast = `已关联 ${name}`;
            app.globalData.galleryBatchLinked = {
              batchId: this.data.linkBatchId,
              customer
            };
            wx.navigateBack();
          })
          .catch((err) => {
            wx.hideLoading();
            console.error("关联批次客户失败:", err);
            wx.showToast({ title: "关联失败", icon: "none" });
          });
        return;
      }
      if (this.data.forGallery) {
        app.globalData.galleryFilterCustomerId = customer._id;
        app.globalData.galleryFilterCustomer = customer;
      } else {
        app.globalData.selectedCustomerId = customer._id;
        app.globalData.selectedCustomer = customer;
        wx.setStorageSync("selectedCustomerId", customer._id);
      }
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
  },

  /** 插入 4 条模拟客户（云函数 initTestData · insertSample4） */
  async onSeedMockCustomers() {
    const storeId = app.globalData.storeId;
    if (!storeId) {
      wx.showToast({ title: "请先登录门店", icon: "none" });
      return;
    }
    wx.showLoading({ title: "插入中..." });
    try {
      const res = await wx.cloud.callFunction({
        name: "initTestData",
        data: { action: "insertSample4", storeId }
      });
      wx.hideLoading();
      const result = res.result || {};
      if (result.success) {
        wx.showToast({ title: result.message || "已插入", icon: "none", duration: 2500 });
        this.setData({ customers: [], hasMore: true, currentPage: 0 });
        this.loadCustomers();
      } else {
        wx.showToast({
          title: result.message || result.error || "插入失败",
          icon: "none",
          duration: 3000
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error("insertSample4 failed:", err);
      wx.showToast({
        title: err.errMsg || err.message || "云函数未部署",
        icon: "none",
        duration: 3000
      });
    }
  }
});