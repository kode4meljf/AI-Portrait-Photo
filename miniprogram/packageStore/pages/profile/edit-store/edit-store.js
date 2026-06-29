/**
 * @file 编辑门店信息页面
 */

const app = getApp();
const { isValidStoreId, updateStoreProfile, callStoreMember } = require('../../../../utils/storeSession');
const { getProfileCollection } = require('../../../../utils/account');
const { normalizeMobilePhone } = require('../../../../utils/phone');
const { isStoreOwner } = require('../../../../utils/storeRole');
const { ensurePrivacyAuthorized } = require('../../../../utils/privacy');

const TEXT_FIELDS = [
  "name",
  "contactName",
  "contactPhone",
  "address",
  "addressName",
  "addressDetail",
  "distanceText",
  "houseNumber"
];

Page({
  behaviors: [require('../../../../behaviors/pageShare')],
  data: {
    storeInfo: null,
    isChanged: false,
    isAvatarUploading: false,
    initialTextSnapshot: {},
    form: {
      name: "",
      contactName: "",
      contactPhone: "",
      address: "",
      addressName: "",
      addressDetail: "",
      distanceText: "",
      houseNumber: "",
      avatarUrl: "",
      latitude: null,
      longitude: null
    },
    nameCheckStatus: "",
    nameCheckHint: ""
  },

  onLoad() {
    if (!isValidStoreId(app.globalData.storeId)) {
      wx.showToast({ title: '请先登录门店', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    if (!isStoreOwner(app)) {
      wx.showToast({ title: '仅店长可编辑门店资料', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.loadStoreInfo();
  },

  isStoreReady() {
    return isValidStoreId(app.globalData.storeId);
  },

  getStoreDocId() {
    return app.globalData.storeId;
  },

  createTextSnapshot(form) {
    return TEXT_FIELDS.reduce((acc, key) => {
      acc[key] = (form[key] || "").trim();
      return acc;
    }, {});
  },

  setInitialSnapshot(form) {
    const snapshot = this.createTextSnapshot(form);
    this.setData({
      initialTextSnapshot: snapshot,
      isChanged: false
    });
  },

  refreshChangedState() {
    const current = this.createTextSnapshot(this.data.form);
    const initial = this.data.initialTextSnapshot || {};
    const isChanged = TEXT_FIELDS.some((key) => current[key] !== (initial[key] || ""));
    if (isChanged !== this.data.isChanged) {
      this.setData({ isChanged });
    }
  },

  applyOfflineForm() {
    const form = {
      name: "",
      contactName: "",
      contactPhone: "",
      address: "",
      addressName: "",
      addressDetail: "",
      distanceText: "",
      houseNumber: "",
      avatarUrl: "",
      latitude: null,
      longitude: null
    };
    this.setData({
      storeInfo: null,
      form
    });
    this.setInitialSnapshot(form);
  },

  async loadStoreInfo() {
    if (!this.isStoreReady()) {
      this.applyOfflineForm();
      wx.showToast({
        title: "云开发未就绪，请检查网络与 login 云函数",
        icon: "none",
        duration: 2800
      });
      return;
    }
    try {
      const db = wx.cloud.database();
      const res = await db.collection(getProfileCollection()).doc(this.getStoreDocId()).get();
      const info = res.data;
      const houseNumber = info.houseNumber || "";
      const mapAddress = info.mapAddress || info.address || "";
      const addressName = info.addressName || "";
      const addressDetail = info.addressDetail || mapAddress || "";
      const distanceText = info.distanceText || "";
      const form = {
        name: info.name || "",
        contactName: info.contactName || "",
        contactPhone: info.contactPhone || "",
        address: mapAddress,
        addressName,
        addressDetail,
        distanceText,
        houseNumber,
        avatarUrl: info.avatarUrl || "",
        latitude: typeof info.latitude === "number" ? info.latitude : null,
        longitude: typeof info.longitude === "number" ? info.longitude : null
      };
      this.setData({
        storeInfo: info,
        form
      });
      this.setInitialSnapshot(form);
    } catch (error) {
      console.error("加载门店信息失败:", error);
      this.applyOfflineForm();
      wx.showToast({ title: "门店档案不存在或无权限", icon: "none" });
    }
  },

  onInputChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`form.${field}`]: e.detail.value
    });
    if (field === "name") {
      this.setData({ nameCheckStatus: "", nameCheckHint: "" });
    }
    this.refreshChangedState();
  },

  onNameBlur(e) {
    this.runNameCheck((e.detail.value || "").trim());
  },

  async runNameCheck(name) {
    const trimmed = (name || this.data.form.name || "").trim();
    const initial = (this.data.initialTextSnapshot.name || "").trim();
    if (!trimmed) {
      this.setData({ nameCheckStatus: "", nameCheckHint: "" });
      return;
    }
    if (trimmed === initial) {
      this.setData({ nameCheckStatus: "", nameCheckHint: "" });
      return;
    }
    this.setData({ nameCheckStatus: "checking", nameCheckHint: "" });
    try {
      const res = await callStoreMember("store.checkName", {
        name: trimmed,
        excludeStoreId: this.getStoreDocId()
      });
      if (res.available) {
        this.setData({ nameCheckStatus: "ok", nameCheckHint: "" });
      } else {
        this.setData({
          nameCheckStatus: "dup",
          nameCheckHint: res.reason || "该门店名称已被使用，请换一个名称"
        });
      }
    } catch (error) {
      this.setData({ nameCheckStatus: "", nameCheckHint: "" });
    }
  },

  async chooseAddressOnMap() {
    try {
      await ensurePrivacyAuthorized();
    } catch (e) {
      wx.showToast({ title: "需同意隐私政策后选点", icon: "none" });
      return;
    }
    wx.chooseLocation({
      success: (res) => {
        const name = (res.name || "").trim();
        const addr = (res.address || "").trim();
        const mapRaw = (res.detailInfo || "").trim();
        const distanceText = (res.distance || "").trim();
        const mapAddress = addr || name || mapRaw;

        this.setData({
          "form.address": mapAddress,
          "form.addressName": name || mapAddress,
          "form.addressDetail": mapRaw || addr || mapAddress,
          "form.distanceText": distanceText,
          "form.latitude": typeof res.latitude === "number" ? res.latitude : null,
          "form.longitude": typeof res.longitude === "number" ? res.longitude : null
        });
        this.refreshChangedState();
      },
      fail: (err) => {
        const msg = err && err.errMsg ? String(err.errMsg) : "";
        if (msg.indexOf("cancel") !== -1) return;
        wx.showToast({ title: "未能打开选点", icon: "none" });
      }
    });
  },

  async chooseAvatar() {
    if (!this.isStoreReady()) {
      wx.showToast({ title: "云开发未就绪，无法上传", icon: "none" });
      return;
    }
    try {
      const chooseRes = await wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sizeType: ["compressed"],
        sourceType: ["album", "camera"]
      });
      if (!chooseRes.tempFiles || chooseRes.tempFiles.length === 0) return;

      let filePath = chooseRes.tempFiles[0].tempFilePath;
      if (typeof wx.cropImage === "function") {
        try {
          const cropRes = await wx.cropImage({ src: filePath });
          if (cropRes && cropRes.tempFilePath) {
            filePath = cropRes.tempFilePath;
          }
        } catch (cropErr) {
          const cropMsg = cropErr && cropErr.errMsg ? String(cropErr.errMsg) : "";
          if (cropMsg.indexOf("cancel") === -1) {
            wx.showToast({ title: "裁剪失败，已使用原图", icon: "none" });
          } else {
            return;
          }
        }
      }

      this.setData({ isAvatarUploading: true });
      wx.showLoading({ title: "上传头像中..." });
      const cloudPath = `store/${this.getStoreDocId()}_${Date.now()}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath
      });

      const avatarUrl = uploadRes.fileID;
      try {
        await updateStoreProfile({ avatarUrl });
      } catch (profileErr) {
        const { deleteCloudFileSafe } = require("../../../../utils/cloudFileCleanup");
        await deleteCloudFileSafe(avatarUrl);
        throw profileErr;
      }

      this.setData({ "form.avatarUrl": avatarUrl });
      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (error) {
      const msg = error && error.errMsg ? String(error.errMsg) : "";
      if (msg.indexOf("cancel") !== -1) return;
      console.error("更新头像失败:", error);
      wx.showToast({ title: "头像更新失败", icon: "none" });
    } finally {
      this.setData({ isAvatarUploading: false });
      wx.hideLoading();
    }
  },

  async save() {
    if (!this.data.isChanged) {
      wx.showToast({ title: "暂无修改", icon: "none" });
      return;
    }
    if (!this.isStoreReady()) {
      wx.showToast({ title: "云开发未就绪，无法保存", icon: "none" });
      return;
    }
    const mapAddress = (this.data.form.address || "").trim();
    if (!mapAddress) {
      wx.showToast({ title: "请先地图选点", icon: "none" });
      return;
    }
    if (this.data.nameCheckStatus === "checking") {
      wx.showToast({ title: "正在检查名称…", icon: "none" });
      return;
    }
    if (this.data.nameCheckStatus === "dup") {
      wx.showToast({
        title: this.data.nameCheckHint || "该门店名称已被使用",
        icon: "none"
      });
      return;
    }
    const phoneResult = normalizeMobilePhone(this.data.form.contactPhone);
    if (!phoneResult.ok) {
      wx.showToast({ title: phoneResult.error, icon: "none" });
      return;
    }
    const houseNumber = (this.data.form.houseNumber || "").trim();
    const fullAddress = [mapAddress, houseNumber].filter(Boolean).join(" ");

    wx.showLoading({ title: "保存中..." });
    try {
      await updateStoreProfile({
        name: this.data.form.name,
        contactName: this.data.form.contactName,
        contactPhone: phoneResult.phone,
        address: fullAddress,
        mapAddress,
        addressName: this.data.form.addressName,
        addressDetail: this.data.form.addressDetail,
        distanceText: this.data.form.distanceText,
        houseNumber,
        latitude: this.data.form.latitude,
        longitude: this.data.form.longitude
      });
      this.setInitialSnapshot(this.data.form);
      wx.showToast({ title: "保存成功", icon: "success" });
      setTimeout(() => wx.navigateBack(), 1000);
    } catch (error) {
      console.error("保存失败:", error);
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  }
});
