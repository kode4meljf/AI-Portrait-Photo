/**
 * @file 充值页面
 * @description 展示套餐并模拟充值
 */

const app = getApp();

Page({
  data: {
    packages: [
      { id: 1, name: "体验套餐", times: 10, price: 99, originalPrice: 199, tag: "限时5折" },
      { id: 2, name: "标准套餐", times: 50, price: 399, originalPrice: 599, tag: "推荐" },
      { id: 3, name: "尊享套餐", times: 200, price: 1299, originalPrice: 1999, tag: "超值" }
    ],
    selectedPackage: null,
    submitting: false
  },

  onLoad() {
    this.setData({ selectedPackage: this.data.packages[0] });
  },

  selectPackage(e) {
    const pkg = e.currentTarget.dataset.pkg;
    this.setData({ selectedPackage: pkg });
  },

  async confirmRecharge() {
    if (!this.data.selectedPackage) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: "处理中..." });

    try {
      // 模拟支付流程（实际应调用微信支付或云函数）
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 更新门店余额
      const db = wx.cloud.database();
      await db.collection("store_profile").doc(app.globalData.storeId).update({
        data: {
          balance: db.command.inc(this.data.selectedPackage.times),
          packageTotal: this.data.selectedPackage.times,
          packageUsed: 0,
          packageExpireDate: new Date(Date.now() + 30 * 86400000)
        }
      });

      wx.showToast({ title: "充值成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (error) {
      console.error("充值失败:", error);
      wx.showToast({ title: "充值失败", icon: "error" });
    } finally {
      this.setData({ submitting: false });
      wx.hideLoading();
    }
  }
});