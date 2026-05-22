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

      const _ = db.command;
      const dayStart = new Date(`${date}T00:00:00`).getTime();
      const dayEnd = dayStart + 86400000 - 1;

      const [byDateRes, byTimeRes] = await Promise.all([
        db.collection("checkins").where({ storeId, checkinDate: date }).get(),
        db.collection("checkins")
          .where({ storeId, createTime: _.gte(dayStart).and(_.lte(dayEnd)) })
          .get()
      ]);

      const checkedIds = new Set();
      [...(byDateRes.data || []), ...(byTimeRes.data || [])].forEach((c) => {
        const id = c.customerDocId;
        if (id) checkedIds.add(id);
      });

      let filteredCustomers = [];
      if (this.data.type === "checked") {
        filteredCustomers = allCustomers.filter((c) => checkedIds.has(c._id));
      } else {
        filteredCustomers = allCustomers.filter((c) => !checkedIds.has(c._id));
      }

      this.setData({ customers: filteredCustomers });
    } catch (error) {
      console.error("加载名单失败:", error);
    } finally {
      this.setData({ loading: false });
    }
  }
});