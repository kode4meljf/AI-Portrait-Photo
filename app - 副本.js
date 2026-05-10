/**
 * @file 应用入口文件
 * @description 初始化云开发、登录获取openId、确保门店配置存在
 */

App({
  globalData: {
    selectedCustomerId: null,   // 当前选中的客户ID
    storeId: null,               // 门店ID（= openId）
    userInfo: null,              // 门店信息
    openId: null,                // 当前用户的openId
    aiTaskTimer: null            // AI任务轮询定时器
  },

  async onLaunch() {
    // 1. 初始化云开发
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    }
    wx.cloud.init({
      env: "net-cloud1-d6gv1m63z0a7c8c65",        // 替换为您的真实云环境ID
      traceUser: true
    });

    try {
      // 2. 调用 login 云函数获取 openId
      const { result } = await wx.cloud.callFunction({ name: "login" });
      const openId = result.openid;
      if (!openId) {
        throw new Error("获取 openId 失败");
      }
      this.globalData.openId = openId;
      this.globalData.storeId = openId;   // 使用 openId 作为门店唯一标识

      const db = wx.cloud.database();
      const storeCollection = db.collection("store_profile");

      // 3. 使用 set 方法自动创建或更新门店记录
      //    set 会以 _id = openId 写入，若文档已存在则覆盖，不存在则创建
      await storeCollection.doc(openId).set({
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
          createTime: db.serverDate()
        }
      });

      // 4. 读取门店信息存入全局变量和本地缓存
      const storeRes = await storeCollection.doc(openId).get();
      this.globalData.userInfo = storeRes.data;
      wx.setStorageSync("storeInfo", storeRes.data);

      console.log("初始化成功，门店ID:", openId);
    } catch (error) {
      console.error("初始化失败:", error);
      // 降级处理：使用模拟门店ID，保证页面不因空数据而报错
      this.globalData.storeId = "mock_store_id";
      this.globalData.userInfo = {
        name: "演示门店",
        balance: 100,
        level: "普通会员"
      };
      // 可选：提示用户网络或权限问题
      wx.showToast({
        title: "初始化异常，部分功能受限",
        icon: "none",
        duration: 2000
      });
    }
  }
});