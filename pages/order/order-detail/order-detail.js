/**
 * @file 订单详情页
 * @description 展示订单关联的照片及物流信息
 */

const app = getApp();

Page({
  data: {
    orderId: "",
    order: null,
    photos: []
  },

  onLoad(options) {
    this.setData({ orderId: options.orderId });
    this.loadOrderDetail();
  },

  async loadOrderDetail() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection("frame_orders").doc(this.data.orderId).get();
      const order = res.data;
      order.createTimeStr = this.formatDate(order.createTime);
      this.setData({ order, photos: order.photos || [] });
    } catch (error) {
      console.error("加载订单详情失败:", error);
      wx.showToast({ title: "加载失败", icon: "error" });
    }
  },

  formatDate(date) {
    if (!date) return "";
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}`;
  },

  previewImage(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({ urls: this.data.photos, current: url });
  }
});