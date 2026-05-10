/**
 * @file 编辑门店信息页面
 */

const app = getApp();

Page({
  data: {
    storeInfo: null,
    form: {
      name: "",
      contactName: "",
      contactPhone: "",
      address: "",
      avatarUrl: ""
    }
  },

  onLoad() {
    this.loadStoreInfo();
  },

  async loadStoreInfo() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection("store_profile").doc(app.globalData.storeId).get();
      const info = res.data;
      this.setData({
        storeInfo: info,
        form: {
          name: info.name || "",
          contactName: info.contactName || "",
          contactPhone: info.contactPhone || "",
          address: info.address || "",
          avatarUrl: info.avatarUrl || ""
        }
      });
    } catch (error) {
      console.error("加载门店信息失败:", error);
    }
  },

  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
  },

  async chooseAvatar() {
    const res = await wx.chooseImage({ count: 1, sizeType: ["compressed"] });
    if (res.tempFilePaths.length > 0) {
      const cloudPath = `store/${Date.now()}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: res.tempFilePaths[0]
      });
      this.setData({ "form.avatarUrl": uploadRes.fileID });
    }
  },

  async save() {
    wx.showLoading({ title: "保存中..." });
    try {
      const db = wx.cloud.database();
      await db.collection("store_profile").doc(app.globalData.storeId).update({
        data: {
          name: this.data.form.name,
          contactName: this.data.form.contactName,
          contactPhone: this.data.form.contactPhone,
          address: this.data.form.address,
          avatarUrl: this.data.form.avatarUrl
        }
      });
      wx.showToast({ title: "保存成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (error) {
      console.error("保存失败:", error);
      wx.showToast({ title: "保存失败", icon: "error" });
    } finally {
      wx.hideLoading();
    }
  }
});