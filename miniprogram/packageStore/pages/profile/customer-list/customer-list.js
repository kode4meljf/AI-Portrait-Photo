/**
 * @file 客户列表页面（工作台）
 * @description 列表与编辑 UI 与首页 customer-picker 共用样式与 customer-edit-panel 组件
 */

const app = getApp();
const { getCustomerDisplayName } = require('../../../../utils/customerDisplay');
const { mapCustomerRow, calcListStats } = require('../../../../utils/customerListDisplay');
const { callStoreMember, isValidStoreId } = require('../../../../utils/storeSession');

Page({
  data: {
    selectMode: false,
    forGallery: false,
    forBatchLink: false,
    linkBatchId: '',
    highlightId: '',
    customers: [],
    searchKeyword: '',
    loading: false,
    refreshing: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    totalCustomers: 0,
    totalCheckins: 0,
    editPanelVisible: false,
    editingId: '',
    storeReady: false,
    loadError: ''
  },

  onLoad(options) {
    const purpose = options.purpose || options.for;
    const selectMode = options.selectMode === 'true';
    this.setData({
      selectMode,
      forGallery: purpose === 'gallery',
      forBatchLink: purpose === 'batchLink',
      linkBatchId: options.batchId ? decodeURIComponent(options.batchId) : '',
      highlightId: options.highlightId || ''
    });
    if (this.data.forBatchLink) {
      wx.setNavigationBarTitle({ title: '选择客户' });
    }
    this.loadCustomers();
  },

  onShow() {
    if (this.data.editPanelVisible) {
      wx.setNavigationBarTitle({ title: '编辑客户' });
      return;
    }
    if (
      isValidStoreId(app.globalData.storeId) &&
      this.data.customers.length === 0 &&
      !this.data.loading
    ) {
      this.loadCustomers();
    }
  },

  /** 编辑态拦截系统返回，回到列表而非退出页面 */
  onBackPress() {
    if (this.data.editPanelVisible) {
      this.onEditBack();
      return true;
    }
    return false;
  },

  debounce(fn, delay = 300) {
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      fn.call(this);
      this._searchTimer = null;
    }, delay);
  },

  async loadCustomers(isLoadMore = false) {
    if (this.data.loading) return;
    if (isLoadMore && !this.data.hasMore) return;

    const storeId = app.globalData.storeId;
    const storeReady = isValidStoreId(storeId);
    if (!storeReady) {
      this.setData({
        loading: false,
        refreshing: false,
        storeReady: false,
        loadError: '请先登录门店',
        customers: [],
        ...calcListStats([])
      });
      return;
    }

    this.setData({ loading: true, storeReady: true, loadError: '' });

    try {
      const db = wx.cloud.database();
      let query = db.collection('customers').where({ storeId });

      if (this.data.searchKeyword) {
        const _ = db.command;
        const kw = this.data.searchKeyword;
        query = db.collection('customers').where(
          _.and([
            { storeId },
            _.or([
              { nickName: db.RegExp({ regexp: kw, options: 'i' }) },
              { phone: db.RegExp({ regexp: kw, options: 'i' }) }
            ])
          ])
        );
      }

      const skip = isLoadMore ? this.data.currentPage * this.data.pageSize : 0;
      const res = await query
        .orderBy('createTime', 'desc')
        .skip(skip)
        .limit(this.data.pageSize)
        .get();

      const customers = res.data.map((c) => mapCustomerRow(c));
      const allCustomers = isLoadMore ? [...this.data.customers, ...customers] : customers;

      this.setData({
        customers: allCustomers,
        hasMore: res.data.length === this.data.pageSize,
        currentPage: isLoadMore ? this.data.currentPage + 1 : 1,
        ...calcListStats(allCustomers)
      });
    } catch (error) {
      console.error('加载客户列表失败:', error);
      const msg = (error && (error.errMsg || error.message)) || '加载失败';
      if (!isLoadMore) {
        this.setData({
          customers: [],
          loadError: msg.includes('ok') ? '加载失败' : msg,
          ...calcListStats([])
        });
      }
      wx.showToast({ title: '加载客户失败', icon: 'none' });
    } finally {
      this.setData({ loading: false, refreshing: false });
    }
  },

  onSearchInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ searchKeyword: keyword });
    this.debounce(() => {
      this.setData({ customers: [], hasMore: true, currentPage: 0 });
      this.loadCustomers();
    });
  },

  onClearSearch() {
    this.setData({ searchKeyword: '', customers: [], hasMore: true, currentPage: 0 });
    this.loadCustomers();
  },

  onEditCustomer(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.hideKeyboard();
    this.setData({ editPanelVisible: true, editingId: id });
    wx.setNavigationBarTitle({ title: '编辑客户' });
  },

  onEditBack() {
    wx.hideKeyboard();
    const title = this.data.forBatchLink ? '选择客户' : '客户列表';
    wx.setNavigationBarTitle({ title });
    this.setData({ editPanelVisible: false, editingId: '' });
  },

  async onEditSaved() {
    this.onEditBack();
    this.setData({ customers: [], hasMore: true, currentPage: 0 });
    await this.loadCustomers();
  },

  async linkBatchToCustomer(batchId, customer) {
    if (!batchId) throw new Error('缺少批次 ID');
    return callStoreMember('batch.linkCustomer', {
      batchId,
      customerDocId: customer._id
    });
  },

  onCustomerTap(e) {
    const customer = e.currentTarget.dataset.customer;
    if (this.data.selectMode) {
      if (this.data.forBatchLink && this.data.linkBatchId) {
        wx.showLoading({ title: '关联中...' });
        this.linkBatchToCustomer(this.data.linkBatchId, customer)
          .then(() => {
            wx.hideLoading();
            const name = getCustomerDisplayName(customer);
            app.globalData.pendingGalleryToast = `已关联 ${name}`;
            app.globalData.galleryBatchLinked = {
              batchId: this.data.linkBatchId,
              customer
            };
            wx.navigateBack();
          })
          .catch((err) => {
            wx.hideLoading();
            console.error('关联批次客户失败:', err);
            wx.showToast({ title: '关联失败', icon: 'none' });
          });
        return;
      }
      if (this.data.forGallery) {
        app.globalData.galleryFilterCustomerId = customer._id;
        app.globalData.galleryFilterCustomer = customer;
      } else {
        app.globalData.selectedCustomerId = customer._id;
        app.globalData.selectedCustomer = customer;
        wx.setStorageSync('selectedCustomerId', customer._id);
      }
      wx.navigateBack();
      return;
    }
    this.onEditCustomer({ currentTarget: { dataset: { id: customer._id } } });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCustomers(true);
    }
  },

  onPullDownRefresh() {
    this.setData({ customers: [], hasMore: true, currentPage: 0, refreshing: true });
    this.loadCustomers().then(() => wx.stopPullDownRefresh());
  }
});
