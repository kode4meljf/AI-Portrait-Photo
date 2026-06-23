const { fetchStoreBalance } = require('../../../utils/portraitBilling');
const { safeNavigateBack } = require('../../../../utils/navigation');
const {
  fetchPayStatus,
  fetchRechargePackages,
  createRechargeOrder,
  requestWxPayment,
  waitRechargePaid,
  queryRechargeOrder
} = require('../../../utils/payApi');
const {
  splitPackages,
  pickDefaultPackage,
  formatPointsNum
} = require('../../../utils/rechargePackages');
const { getPointsPriceList, formatBalanceDisplay } = require('../../../../utils/storePoints');

Page({
  data: {
    packages: [],
    casualPackages: [],
    annualPackages: [],
    selectedPackage: null,
    selectedPrice: 0,
    selectedTotalText: '0',
    selectedBonusLine: '',
    submitting: false,
    payConfigured: false,
    balance: 0,
    balanceDisplay: { text: '0', size: 'lg', full: '0', compact: false },
    loadError: '',
    showPriceModal: false,
    priceList: [],
    priceModalPageStyle: ''
  },

  onLoad() {
    this.setData({ priceList: getPointsPriceList() });
    this.loadPageData();
  },

  syncSelected(pkg) {
    if (!pkg) {
      this.setData({
        selectedPackage: null,
        selectedPrice: 0,
        selectedTotalText: '0',
        selectedBonusLine: ''
      });
      return;
    }
    this.setData({
      selectedPackage: pkg,
      selectedPrice: pkg.price,
      selectedTotalText: pkg.totalPointsText || formatPointsNum(pkg.points),
      selectedBonusLine: pkg.bonusText ? `赠送 ${pkg.bonusText}` : ''
    });
  },

  async loadPageData() {
    wx.showLoading({ title: '加载中', mask: true });
    try {
      const [status, packages, balance] = await Promise.all([
        fetchPayStatus(),
        fetchRechargePackages(),
        fetchStoreBalance()
      ]);
      const { enriched, casualPackages, annualPackages } = splitPackages(packages);
      const selectedPackage = pickDefaultPackage(enriched);
      this.setData({
        payConfigured: !!status.configured,
        packages: enriched,
        casualPackages,
        annualPackages,
        balance,
        balanceDisplay: formatBalanceDisplay(balance),
        loadError: enriched.length ? '' : '暂无可用套餐'
      });
      this.syncSelected(selectedPackage);
    } catch (err) {
      console.error('[recharge] 加载失败', err);
      this.setData({
        loadError: err.message || '加载失败',
        packages: [],
        casualPackages: [],
        annualPackages: []
      });
      this.syncSelected(null);
    } finally {
      wx.hideLoading();
    }
  },

  selectPackage(e) {
    const id = Number(e.currentTarget.dataset.id);
    const pkg = this.data.packages.find((p) => p.id === id);
    if (pkg) this.syncSelected(pkg);
  },

  onOpenPriceList() {
    this.setData({
      showPriceModal: true,
      priceModalPageStyle: 'overflow:hidden;height:100vh;'
    });
  },

  onClosePriceList() {
    this.setData({
      showPriceModal: false,
      priceModalPageStyle: ''
    });
  },

  onPriceModalTap() {},

  preventMove() {},

  async confirmRecharge() {
    if (!this.data.selectedPackage || this.data.submitting) return;
    if (!this.data.payConfigured) {
      wx.showToast({ title: '支付尚未配置', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '调起支付...', mask: true });

    try {
      const order = await createRechargeOrder(this.data.selectedPackage.id);
      const points = order.points || order.times || this.data.selectedPackage.points;

      if (order.mockPaid) {
        wx.hideLoading();
        await this.onRechargeSuccess(points);
        return;
      }

      await requestWxPayment(order.payment);

      wx.showLoading({ title: '确认到账...', mask: true });
      try {
        await waitRechargePaid(order.outTradeNo);
      } catch (pollErr) {
        const latest = await queryRechargeOrder(order.outTradeNo).catch(() => null);
        if (latest && latest.status === 'paid') {
          await this.onRechargeSuccess(latest.points || latest.times);
          return;
        }
        throw pollErr;
      }

      wx.hideLoading();
      await this.onRechargeSuccess(points);
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

  async onRechargeSuccess(points) {
    this.setData({ submitting: false });
    try {
      const balance = await fetchStoreBalance();
      this.setData({
        balance,
        balanceDisplay: formatBalanceDisplay(balance)
      });
    } catch (e) {
      /* ignore */
    }
    safeNavigateBack({
      success: () => {
        wx.showToast({ title: `充值成功 +${points}积分`, icon: 'success' });
      }
    });
  }
});
