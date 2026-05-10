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
      env: "net-cloud1-d6gv1m63z0a7c8c65", 
      traceUser: true,
    });

    try {
      // 调用 login 云函数获取 openId
      const { result } = await wx.cloud.callFunction({ name: "login" });
      const openId = result.openid;
      if (!openId) throw new Error("获取openId失败");

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