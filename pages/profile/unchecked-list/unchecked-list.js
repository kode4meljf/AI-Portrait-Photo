/**
 * @file 未打卡/已打卡名单页面
 * @description 展示指定日期的打卡状态客户列表
 */

const app = getApp();

Page({
  data: {
    date: "",
    type: "",     // unchecked, checked, yesterday
    customers: [],
    loading: false
  },

  onLoad(options) {
    this.setData({
      date: options.date,
      type: options.type
    });
    this.loadList();
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const storeId = app.globalData.storeId;
      const date = this.data.date;

      // 获取所有客户
      const allCustomersRes = await db.collection("customers")
        .where({ storeId })
        .get();
      const allCustomers = allCustomersRes.data;

      // 获取当天已打卡的客户ID
      const checkinsRes = await db.collection("checkins")
        .where({ storeId, checkinDate: date })
        .get();
      const checkedIds = new Set(checkinsRes.data.map(c => c.customerId));

      let filteredCustomers = [];
      if (this.data.type === "checked") {
        filteredCustomers = allCustomers.filter(c => checkedIds.has(c._id));
      } else {
        filteredCustomers = allCustomers.filter(c => !checkedIds.has(c._id));
      }

      this.setData({ customers: filteredCustomers });
    } catch (error) {
      console.error("加载名单失败:", error);
    } finally {
      this.setData({ loading: false });
    }
  }
});