// app.js
const { CLOUD_ENV_ID } = require('./config/cloudEnv');
const { applySessionToApp, isValidStoreId, resolveSessionIfNeeded } = require('./utils/storeSession');

App({
  globalData: {
    accountId: null,
    accountKind: 'none',
    customer: null,
    customerDocId: null,
    selectedCustomerId: null,
    selectedCustomer: null,
    /** 云相册筛选：null 表示全店 */
    galleryFilterCustomerId: null,
    galleryFilterCustomer: null,
    storeId: null,
    storeRole: null,
    storeName: '',
    membership: null,
    userInfo: null,
    openId: null,
    aiTaskTimer: null,
    ordersNeedRefresh: false,
    /** 生成结果 → 摆台：cloud:// fileID，避免 query 重复传大图路径 */
    pendingFrameOrder: null,
    /** 云相册：从客户列表返回后展示关联成功提示 */
    pendingGalleryToast: '',
    /** 云相册：刚关联的批次与客户（列表即时展示，刷新后以库为准） */
    galleryBatchLinked: null,
    /** launch 页用户已主动关闭的门店成员结果（未通过/已移出），按 storeId 匹配 */
    launchDismissStoreId: null,
    /** launch 网关：true 时 onShow 需重新 account.resolve */
    sessionDirty: true
  },

  async onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: CLOUD_ENV_ID,
      traceUser: true
    });

    try {
      await this.ensureLogin();
    } catch (error) {
      console.error('初始化失败:', error);
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
  },

  async ensureLogin() {
    if (this.globalData.openId) return this.globalData.openId;

    await new Promise((resolve, reject) => {
      wx.login({ success: resolve, fail: reject });
    });
    const cloudRes = await wx.cloud.callFunction({ name: 'login' });
    if (cloudRes.errMsg && cloudRes.errMsg !== 'cloud.callFunction:ok') {
      throw new Error(cloudRes.errMsg || 'login 云函数调用失败');
    }
    const result = cloudRes.result || {};
    const payload = result.data && typeof result.data === 'object' ? result.data : result;
    const openId =
      payload.openid ||
      payload.openId ||
      payload.OPENID ||
      result.openid ||
      result.OPENID;
    if (!openId) throw new Error('获取 openId 失败');

    this.globalData.openId = openId;
    this.globalData.accountId = openId;
    return openId;
  },

  async refreshStoreSession() {
    await this.ensureLogin();
    return resolveSessionIfNeeded(this, { force: true });
  },

  requireStoreId() {
    const storeId = this.globalData.storeId;
    if (!isValidStoreId(storeId)) {
      throw new Error('请先完成门店登录');
    }
    return storeId;
  }
});
