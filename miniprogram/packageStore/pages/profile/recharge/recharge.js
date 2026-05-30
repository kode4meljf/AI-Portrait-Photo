const app = getApp();
const { fetchStoreBalance } = require('../../../../utils/portraitBilling');
const { safeNavigateBack } = require('../../../../utils/navigation');
const {
  fetchPayStatus,
  fetchRechargePackages,
  createRechargeOrder,
  requestWxPayment,
  waitRechargePaid,
  queryRechargeOrder
} = require('../../../../utils/payApi');

Page({
  data: {
    packages: [],
    selectedPackage: null,
    submitting: false,
    payConfigured: false,
    balance: 0,
    loadError: ''
  },

  onLoad() {
    this.loadPageData();
  },

  async loadPageData() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const [status, packages, balance] = await Promise.all([
        fetchPayStatus(),
        fetchRechargePackages(),
        fetchStoreBalance()
      ]);
      this.setData({
        payConfigured: !!status.configured,
        packages,
        selectedPackage: packages[0] || null,
        balance,
        loadError: packages.length ? '' : '暂无可用套餐'
      });
    } catch (err) {
      console.error('[recharge] 加载失败', err);
      this.setData({
        loadError: err.message || '加载失败',
        packages: [],
        selectedPackage: null
      });
    } finally {
      wx.hideLoading();
    }
  },

  selectPackage(e) {
    const pkg = e.currentTarget.dataset.pkg;
    this.setData({ selectedPackage: pkg });
  },

  async confirmRecharge() {
    if (!this.data.selectedPackage || this.data.submitting) return;
    if (!this.data.payConfigured) {
      wx.showToast({ title: '支付尚未配置', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '创建订单...', mask: true });

    try {
      const order = await createRechargeOrder(this.data.selectedPackage.id);

      if (order.mockPaid) {
        wx.hideLoading();
        await this.onRechargeSuccess(order.times);
        return;
      }

      wx.showLoading({ title: '调起支付...', mask: true });
      await requestWxPayment(order.payment);

      wx.showLoading({ title: '确认到账...', mask: true });
      try {
        await waitRechargePaid(order.outTradeNo);
      } catch (pollErr) {
        const latest = await queryRechargeOrder(order.outTradeNo).catch(() => null);
        if (latest && latest.status === 'paid') {
          await this.onRechargeSuccess(latest.times);
          return;
        }
        throw pollErr;
      }

      wx.hideLoading();
      await this.onRechargeSuccess(this.data.selectedPackage.times);
    } catch (err) {
      console.error('[recharge] 支付失败', err);
      wx.hideLoading();
      const msg = (err && err.errMsg) || err.message || '支付失败';
      if (/cancel/i.test(msg)) {
        wx.showToast({ title: '已取消支付', icon: 'none' });
      } else if (err.code === 'PAY_NOT_CONFIGURED') {
        wx.showToast({ title: '支付尚未配置', icon: 'none' });
      } else {
        wx.showToast({ title: msg, icon: 'none', duration: 2800 });
      }
      this.setData({ submitting: false });
    }
  },

  async onRechargeSuccess(times) {
    this.setData({ submitting: false });
    try {
      const balance = await fetchStoreBalance();
      this.setData({ balance });
    } catch (e) {
      /* ignore */
    }
    safeNavigateBack({
      success: () => {
        wx.showToast({ title: `充值成功 +${times}次`, icon: 'success' });
      }
    });
  }
});
