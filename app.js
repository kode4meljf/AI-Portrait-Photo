// app.js
App({
  globalData: {
    selectedCustomerId: null,
    storeId: null,
    userInfo: null,
    openId: null,
    aiTaskTimer: null,
  },

  async onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }
    wx.cloud.init({
      env: "ai-photo-0g22lzk94d0b6846", 
      traceUser: true,
    });

    try {
      await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      const cloudRes = await wx.cloud.callFunction({ name: "login" });
      if (cloudRes.errMsg && cloudRes.errMsg !== "cloud.callFunction:ok") {
        throw new Error(cloudRes.errMsg || "login 云函数调用失败");
      }
      const result = cloudRes.result || {};
      const payload = result.data && typeof result.data === "object" ? result.data : result;
      const openId =
        payload.openid ||
        payload.openId ||
        payload.OPENID ||
        result.openid ||
        result.OPENID;
      if (!openId) {
        console.error(
          "login 返回无 openid，请检查云函数返回字段（支持 result.openid 或 result.data.openid）",
          result
        );
        throw new Error("获取openId失败");
      }

      this.globalData.openId = openId;
      this.globalData.storeId = openId; 
      console.log("初始化成功，门店ID:", openId);

      // 可选：读取或创建门店配置
      const db = wx.cloud.database();
      const storeCol = db.collection("store_profile");
      const storeRes = await storeCol.doc(openId).get().catch(() => null);
      if (!storeRes || !storeRes.data) {
        await storeCol.doc(openId).set({
          data: {
            name: "AI写真馆",
            contactName: "管理员",
            contactPhone: "13800000000",
            address: "默认地址",
            avatarUrl: "",
            level: "普通会员",
            balance: 100,
            packageTotal: 0,
            packageUsed: 0,
            packageExpireDate: null,
            createTime: db.serverDate(),
          },
        });
      }
    } catch (error) {
      console.error("初始化失败:", error);
      // 降级：使用模拟ID，保证页面不崩溃
      this.globalData.storeId = "mock_store_id";
      wx.showToast({ title: "初始化异常，部分功能受限", icon: "none" });
    }
  },
});