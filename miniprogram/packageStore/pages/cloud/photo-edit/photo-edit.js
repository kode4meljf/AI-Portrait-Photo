/**
 * @file 照片编辑页面
 * @description 简单的照片编辑功能（滤镜、裁剪等），可扩展
 */

Page({
  behaviors: [require('../../../../behaviors/pageShare')],
  data: {
    imageUrl: "",
    brightness: 100,
    contrast: 100,
    isProcessing: false
  },

  onLoad(options) {
    this.setData({ imageUrl: decodeURIComponent(options.url || "") });
  },

  onBrightnessChange(e) {
    this.setData({ brightness: e.detail.value });
    this.applyFilter();
  },

  onContrastChange(e) {
    this.setData({ contrast: e.detail.value });
    this.applyFilter();
  },

  applyFilter() {
    // 实际应用滤镜需要调用 Canvas 或第三方库，此处仅为示意
    console.log("应用滤镜:", this.data.brightness, this.data.contrast);
  },

  async saveEdit() {
    this.setData({ isProcessing: true });
    wx.showLoading({ title: "保存中..." });
    // 模拟保存
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: "保存成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 1500);
      this.setData({ isProcessing: false });
    }, 1000);
  }
});