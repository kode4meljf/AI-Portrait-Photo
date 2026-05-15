/**
 * @file 订单列表
 * @description 展示相框订单，按生成时间倒序排列，支持按状态筛选、月份分组、统计概览
 */

const app = getApp();
const formatDate = (date, pattern = "yyyy-MM-dd") => {
  if (!date) return "";
  const d = new Date(date);
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
    loading: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    refreshing: false,
    // 统计概览数据
    monthTotalAmount: 0,
    monthCompare: "",
    categoryCount: {
      frame: 0,
      album: 0,
      photo: 0,
      other: 0
    }
  },

  onLoad() {
    this.loadOrders();
  },

  onShow() {
    if (this.needRefresh) {
      this.refreshData();
      this.needRefresh = false;
    }
  },

  async loadOrders(isLoadMore = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      let query = db.collection("frame_orders")
        .where({ storeId: app.globalData.storeId });

      // 客户过滤
      if (app.globalData.selectedCustomerId) {
        query = query.where({ customerId: app.globalData.selectedCustomerId });
      }

      // 状态筛选（all 表示不筛选）
      if (this.data.currentTab !== "all") {
        let statusMap = {
          "pending": "待处理",
          "producing": "制作中",
          "shipped": "已发货",
          "done": "已完成"
        };
        query = query.where({ status: statusMap[this.data.currentTab] });
      }

      const skip = isLoadMore ? this.data.currentPage * this.data.pageSize : 0;
      const res = await query
        .orderBy("createTime", "desc")
        .skip(skip)
        .limit(this.data.pageSize)
        .get();

      const orders = res.data;
      // 格式化订单并填充客户信息
      const formattedOrders = await this.formatOrders(orders);
      // 更新各状态计数
      await this.updateTabCounts();

      // 合并已有订单（仅用于加载更多）
      let allOrders = isLoadMore ? [...this.data.allOrders, ...formattedOrders] : formattedOrders;
      this.setData({ allOrders: allOrders });

      // 按月份分组并计算月度汇总
      const groups = this.groupOrdersByMonth(allOrders);
      this.setData({
        orderGroups: groups,
        hasMore: formattedOrders.length === this.data.pageSize,
        currentPage: isLoadMore ? this.data.currentPage + 1 : 1
      });

      // 计算本月统计概览（使用当前月份的数据）
      this.calculateStats(groups);
    } catch (error) {
      console.error("加载订单失败:", error);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  async updateTabCounts() {
    // 获取各状态订单数量（仅用于Tab显示角标）
    const db = wx.cloud.database();
    const storeId = app.globalData.storeId;
    const customerCondition = app.globalData.selectedCustomerId ? { customerId: app.globalData.selectedCustomerId } : {};
    const baseCondition = { storeId, ...customerCondition };
    try {
      const pendingCount = await db.collection("frame_orders").where({ ...baseCondition, status: "待处理" }).count();
      const producingCount = await db.collection("frame_orders").where({ ...baseCondition, status: "制作中" }).count();
      const shippedCount = await db.collection("frame_orders").where({ ...baseCondition, status: "已发货" }).count();
      const doneCount = await db.collection("frame_orders").where({ ...baseCondition, status: "已完成" }).count();
      const allCount = pendingCount.total + producingCount.total + shippedCount.total + doneCount.total;
      const tabs = this.data.tabs.map(tab => {
        if (tab.status === "all") return { ...tab, count: allCount };
        if (tab.status === "pending") return { ...tab, count: pendingCount.total };
        if (tab.status === "producing") return { ...tab, count: producingCount.total };
        if (tab.status === "shipped") return { ...tab, count: shippedCount.total };
        if (tab.status === "done") return { ...tab, count: doneCount.total };
        return tab;
      });
      this.setData({ tabs });
    } catch (err) {
      console.error("更新Tab计数失败", err);
    }
  },

  async formatOrders(orders) {
    if (!orders.length) return [];
    const db = wx.cloud.database();
    const customerIds = [...new Set(orders.map(o => o.customerId).filter(id => id))];
    let customerMap = {};
    if (customerIds.length) {
      const res = await db.collection("customers")
        .where({ _id: db.command.in(customerIds) })
        .get();
      res.data.forEach(c => { customerMap[c._id] = c; });
    }
    return orders.map(order => {
      const customerInfo = customerMap[order.customerId] || null;
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
      // 商品列表（根据订单字段构造）
      const items = [{
        name: order.frameName,
        spec: `${order.size} · ${order.material}`,
        price: order.price,
        thumb: order.frameThumb || "https://picsum.photos/96/96?random=1"
      }];
      // 若订单有多个商品可扩展
      return {
        ...order,
        createTimeStr: formatDate(order.createTime, "MM-dd HH:mm"),
        customerInfo,
        statusClass,
        statusText,
        items,
        totalPrice: order.price
      };
    });
  },

  groupOrdersByMonth(orders) {
    const groupsMap = new Map();
    orders.forEach(order => {
      const date = new Date(order.createTime);
      const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      if (!groupsMap.has(monthKey)) {
        groupsMap.set(monthKey, { month: monthKey, totalAmount: 0, orders: [] });
      }
      const group = groupsMap.get(monthKey);
      group.totalAmount += order.price;
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
    const totalAmount = currentGroup ? currentGroup.totalAmount : 0;
    // 计算品类统计（遍历所有订单）
    let frameCount = 0, albumCount = 0, photoCount = 0, otherCount = 0;
    const allOrders = groups.flatMap(g => g.orders);
    allOrders.forEach(order => {
      // 根据 frameName 粗略分类，实际可完善
      const name = order.frameName || "";
      if (name.includes("相框") || name.includes("摆台")) frameCount++;
      else if (name.includes("写真集") || name.includes("相册")) albumCount++;
      else if (name.includes("精修") || name.includes("照片")) photoCount++;
      else otherCount++;
    });
    this.setData({
      monthTotalAmount: totalAmount,
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

  onOrderDetail(e) {
    const order = e.currentTarget.dataset.order;
    wx.navigateTo({
      url: `/pages/order/order-detail/order-detail?orderId=${order._id}`
    });
  },

  onViewLogistics(e) {
    const order = e.currentTarget.dataset.order;
    if (order.shippingNo) {
      wx.showModal({
        title: "物流信息",
        content: `运单号：${order.shippingNo}\n物流公司：顺丰速运\n当前状态：${order.status === "已发货" ? "已发出，预计3天内送达" : "制作中，暂未发货"}`,
        showCancel: false
      });
    } else {
      wx.showToast({ title: "暂无物流信息", icon: "none" });
    }
  },

  onConfirmProduction(e) {
    const order = e.currentTarget.dataset.order;
    wx.showModal({
      title: "确认制作",
      content: "开始制作该订单？",
      success: async (res) => {
        if (res.confirm) {
          // 更新订单状态为“制作中”
          const db = wx.cloud.database();
          await db.collection("frame_orders").doc(order._id).update({
            data: { status: "制作中" }
          });
          wx.showToast({ title: "已开始制作", icon: "success" });
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
          const db = wx.cloud.database();
          await db.collection("frame_orders").doc(order._id).update({
            data: { status: "已完成" }
          });
          wx.showToast({ title: "已确认签收", icon: "success" });
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
    this.loadOrders();
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.refreshData();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadOrders(true);
    }
  }
});