/**
 * @file 客户列表页面（工作台）
 * @description 展示与首页「选择客户」一致的列表；支持搜索、编辑、选择模式（云相册关联等）
 */

const app = getApp();
const { getCustomerDisplayName } = require('../../../../utils/customerDisplay');
const {
  initialFromName,
  pickAvatarTint,
  mapCustomerRow,
  calcListStats
} = require('../../../../utils/customerListDisplay');
const { callStoreMember } = require('../../../../utils/storeSession');

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
    editForm: { nickName: '', phone: '', remark: '' },
    editSnapshot: { nickName: '', phone: '', remark: '' },
    editAvatarUrl: '',
    editAvatarInitial: '客',
    editAvatarTint: '#4e7cf6',
    editWxNickName: '',
    editChanged: false,
    editSaving: false
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
    if (options.seedMock === 'true') {
      this.onSeedMockCustomers();
    }
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
    if (!storeId) {
      wx.showToast({ title: '请先登录门店', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

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
      if (!isLoadMore) {
        this.setData({ customers: [], ...calcListStats([]) });
      }
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

  avatarMetaFromCustomer(customer, id) {
    const nick = customer?.nickName || customer?.wxNickName || '';
    return {
      editAvatarUrl: customer?.avatarUrl || '',
      editAvatarInitial: customer?.avatarInitial || initialFromName(nick),
      editAvatarTint: customer?.avatarTint || pickAvatarTint(id || nick)
    };
  },

  openEditPanel(customer) {
    if (!customer || !customer._id) return;
    const nickName = customer.nickName || '';
    const phone = customer.phone || '';
    const remark = customer.remark || '';
    const snapshot = { nickName, phone, remark };
    wx.setNavigationBarTitle({ title: '编辑客户' });
    this.setData({
      editPanelVisible: true,
      editingId: customer._id,
      editWxNickName: (customer.wxNickName || '').trim(),
      editForm: { ...snapshot },
      editSnapshot: { ...snapshot },
      ...this.avatarMetaFromCustomer(customer, customer._id),
      editChanged: false,
      editSaving: false
    });
  },

  onEditCustomer(e) {
    const id = e.currentTarget.dataset.id;
    const customer = this.data.customers.find((c) => c._id === id);
    if (customer) {
      this.openEditPanel(customer);
      return;
    }
    wx.cloud
      .database()
      .collection('customers')
      .doc(id)
      .get()
      .then((res) => this.openEditPanel(mapCustomerRow(res.data)))
      .catch(() => wx.showToast({ title: '加载失败', icon: 'none' }));
  },

  onEditBack() {
    wx.hideKeyboard();
    wx.setNavigationBarTitle({
      title: this.data.forBatchLink ? '选择客户' : '客户列表'
    });
    this.setData({
      editPanelVisible: false,
      editingId: '',
      editChanged: false,
      editSaving: false
    });
  },

  onEditInput(e) {
    const key = e.currentTarget.dataset.key;
    const value = e.detail.value || '';
    const editForm = { ...this.data.editForm, [key]: value };
    const { editSnapshot } = this.data;
    const editChanged =
      editForm.nickName !== editSnapshot.nickName ||
      editForm.phone !== editSnapshot.phone ||
      editForm.remark !== editSnapshot.remark;
    const patch = { editForm, editChanged };
    if (key === 'nickName') {
      patch.editAvatarInitial = initialFromName(value);
    }
    this.setData(patch);
  },

  async onEditSave() {
    if (this.data.editSaving || !this.data.editChanged || !this.data.editingId) return;
    this.setData({ editSaving: true });
    try {
      const db = wx.cloud.database();
      const nickName = (this.data.editForm.nickName || '').trim();
      const phone = (this.data.editForm.phone || '').trim();
      const remark = (this.data.editForm.remark || '').trim();
      await db.collection('customers').doc(this.data.editingId).update({
        data: { nickName, phone, remark, updateTime: Date.now() }
      });
      if (app.globalData.selectedCustomerId === this.data.editingId) {
        const latest = await db.collection('customers').doc(this.data.editingId).get();
        app.globalData.selectedCustomer = latest.data;
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.onEditBack();
      this.setData({ customers: [], hasMore: true, currentPage: 0 });
      await this.loadCustomers();
    } catch (err) {
      console.error('保存客户失败:', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ editSaving: false });
    }
  },

  async linkBatchToCustomer(batchId, customer) {
    if (!batchId) throw new Error('缺少批次 ID');
    return callStoreMember('batch.linkCustomer', {
      batchId,
      customerId: customer._id
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
    this.openEditPanel(customer);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCustomers(true);
    }
  },

  onPullDownRefresh() {
    this.setData({ customers: [], hasMore: true, currentPage: 0, refreshing: true });
    this.loadCustomers().then(() => wx.stopPullDownRefresh());
  },

  async onSeedMockCustomers() {
    const storeId = app.globalData.storeId;
    if (!storeId) {
      wx.showToast({ title: '请先登录门店', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '插入中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'initTestData',
        data: { action: 'insertSample4', storeId }
      });
      wx.hideLoading();
      const result = res.result || {};
      if (result.success) {
        wx.showToast({ title: result.message || '已插入', icon: 'none', duration: 2500 });
        this.setData({ customers: [], hasMore: true, currentPage: 0 });
        this.loadCustomers();
      } else {
        wx.showToast({
          title: result.message || result.error || '插入失败',
          icon: 'none',
          duration: 3000
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('insertSample4 failed:', err);
      wx.showToast({
        title: err.errMsg || err.message || '云函数未部署',
        icon: 'none',
        duration: 3000
      });
    }
  }
});
