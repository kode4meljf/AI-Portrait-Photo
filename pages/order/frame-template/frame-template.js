// packageOrder/pages/frame-template/frame-template.js
const app = getApp();

Page({
  data: {
    photoUrls: [],
    templates: [],
    selectedTemplate: null,
    submitting: false
  },

  onLoad(options) {
    let photoUrls = [];
    try {
      photoUrls = JSON.parse(decodeURIComponent(options.photoUrls || "[]"));
    } catch (e) {
      console.error("解析photoUrls失败", e);
    }
    this.setData({ photoUrls });
    this.loadTemplates();
  },

  loadTemplates() {
    // 静态模板数据（可替换为云数据库获取）
    const templates = [{
      id: "1",
      name: "欧式实木相框",
      thumb: "https://picsum.photos/200/200?random=101",
      price: 19.9,
      size: "20cm x 20cm",
      material: "实木"
    }, {
      id: "2",
      name: "简约金属相框",
      thumb: "https://picsum.photos/200/200?random=102",
      price: 29.9,
      size: "25cm x 25cm",
      material: "铝合金"
    }, {
      id: "3",
      name: "复古皮质相框",
      thumb: "https://picsum.photos/200/200?random=103",
      price: 39.9,
      size: "20cm x 25cm",
      material: "皮革"
    }];
    this.setData({ templates });
  },

  selectTemplate(e) {
    const template = e.currentTarget.dataset.template;
    this.setData({ selectedTemplate: template });
  },

  async confirmOrder() {
    const { selectedTemplate, photoUrls } = this.data;
    if (!selectedTemplate) {
      wx.showToast({ title: "请选择相框款式", icon: "none" });
      return;
    }
    if (!photoUrls.length) {
      wx.showToast({ title: "未选择照片", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: "生成订单中...", mask: true });

    try {
      // 调用云函数 createOrder
      const res = await wx.cloud.callFunction({
        name: "createOrder",
        data: {
          frameTemplateId: selectedTemplate.id,
          frameName: selectedTemplate.name,
          size: selectedTemplate.size,
          material: selectedTemplate.material,
          price: selectedTemplate.price,
          photos: photoUrls,
          customerId: app.globalData.selectedCustomerId || null
        }
      });

      console.log("云函数返回:", res);

      if (res.result && res.result.success) {
        wx.showToast({ title: "订单生成成功", icon: "success" });
        setTimeout(() => {
          wx.switchTab({ url: "/pages/order-list/order-list" });
        }, 1500);
      } else {
        throw new Error(res.result?.error || "订单生成失败");
      }
    } catch (err) {
      console.error("调用云函数失败:", err);
      wx.showToast({
        title: err.message || "订单生成失败，请重试",
        icon: "none",
        duration: 2000
      });
    } finally {
      this.setData({ submitting: false });
      wx.hideLoading();
    }
  }
});