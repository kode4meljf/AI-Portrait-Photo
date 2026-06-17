// pages/gallery/gallery.js

const app = getApp();
const { getCustomerDisplayName } = require('../../utils/customerDisplay');
const { isValidStoreId } = require('../../utils/storeSession');
const { redirectCustomerIfNeeded } = require('../../utils/storeGuard');
const { syncStoreTabBar } = require('../../utils/storeTabBar');
const { kickPortraitWorker } = require('../../utils/jimengPortraitAi');
const { getProfileCollection } = require('../../utils/account');
const { setBatchFavorite } = require('../../utils/batchFavorite');
const { fetchPhotosByBatchIds, fetchPhotosByBatchId } = require('../../utils/batchPhotos');
const GALLERY_STORE_SCOPE_ID = '__all_store__';

const AUTO_REFRESH_INTERVAL_MS = 8000;
/** 生成超过此时长后停止自动刷新（5 分钟） */
const AUTO_REFRESH_MAX_DURATION_MS = 5 * 60 * 1000;

const AVATAR_COLORS = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#34d399', '#3b6df6'];

function pickAvatarColor(key) {
  const s = String(key || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function formatDate(date, pattern = 'yyyy-MM-dd') {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return pattern
    .replace('yyyy', year)
    .replace('MM', month)
    .replace('dd', day)
    .replace('HH', hour)
    .replace('mm', minute);
}

function deriveBatchStatus(photos) {
  const photoCount = photos.length;
  if (!photoCount) {
    return { status: 'pending', generatedCount: 0, photoCount: 0, progressPercent: 0 };
  }
  let generatedCount = 0;
  let hasActive = false;
  let hasFailed = false;
  photos.forEach((p) => {
    const gs = p.generateStatus;
    if (gs === 'failed') hasFailed = true;
    if (gs === 'pending' || gs === 'processing') hasActive = true;
    if (p.isGenerated || gs === 'completed' || p.aiUrl) generatedCount += 1;
  });
  let status = 'pending';
  if (hasActive || (generatedCount > 0 && generatedCount < photoCount)) {
    status = 'generating';
  } else if (generatedCount >= photoCount) {
    status = hasFailed ? 'partial' : 'completed';
  } else if (hasFailed) {
    status = generatedCount > 0 ? 'partial' : 'failed';
  }
  const progressPercent = Math.min(100, Math.round((generatedCount / photoCount) * 100));
  return { status, generatedCount, photoCount, progressPercent };
}

function buildTimeLabel(createTime) {
  const d = new Date(createTime);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const t = d.getTime();
  const hm = formatDate(d, 'HH:mm');
  if (t >= todayStart) return `今天 ${hm}`;
  if (t >= yesterdayStart) return `昨天 ${hm}`;
  return formatDate(d, 'MM-dd HH:mm');
}

function buildSummaryText(photos, generatedCount, photoCount, batchIsFavorite) {
  const styles = [...new Set(photos.map((p) => (p.styleName || '').trim()).filter(Boolean))];
  let stylePart = '';
  if (styles.length === 1) stylePart = styles[0];
  else if (styles.length > 1) stylePart = `${styles.slice(0, 2).join(' · ')} 等`;
  const parts = [];
  if (stylePart) parts.push(stylePart);
  parts.push(`共 ${photoCount} 张`);
  if (generatedCount < photoCount) parts.push(`已出 ${generatedCount} 张`);
  if (batchIsFavorite) parts.push('已收藏');
  return parts.join(' · ');
}

Page({
  data: {
    activeTab: 'time',
    activeTabIndex: 0,
    timeGroups: [],
    favGroups: [],
    timeHasMore: true,
    favHasMore: true,
    timePage: 0,
    favPage: 0,
    timeLoading: false,
    favLoading: false,
    timeRefreshing: false,
    favRefreshing: false,
    pageSize: 20,
    singleCustomerMode: false,
    filterCustomerName: '',
    filterCustomerInitial: '',
    filterAvatarUrl: '',
    storeAvatarUrl: '',
    pickerVisible: false,
    pickerSelectedId: GALLERY_STORE_SCOPE_ID
  },

  onLoad() {
    this.syncFilterContext();
    this.loadBatches(false, 'time');
  },

  onShow() {
    redirectCustomerIfNeeded().then(async (redirected) => {
      if (redirected) return;
      syncStoreTabBar(this);
      this._autoRefreshStartedAt = null;
      await this.loadStoreInfo();
      this.syncFilterContext();
      const toast = app.globalData.pendingGalleryToast;
      if (toast) {
        app.globalData.pendingGalleryToast = '';
        setTimeout(() => {
          wx.showToast({ title: toast, icon: 'success', duration: 2000 });
        }, 80);
      }
      this.refreshData();
    });
  },

  onHide() {
    this._clearAutoRefresh();
    this._autoRefreshStartedAt = null;
  },

  onUnload() {
    this._clearAutoRefresh();
  },

  syncFilterContext() {
    const customerId = app.globalData.galleryFilterCustomerId || null;
    const singleCustomerMode = !!customerId;
    const selected = app.globalData.galleryFilterCustomer || null;
    let filterCustomerName = '全店客户';
    let filterCustomerInitial = '店';
    let filterAvatarUrl = '';
    let pickerSelectedId = GALLERY_STORE_SCOPE_ID;
    if (singleCustomerMode && selected) {
      filterCustomerName = getCustomerDisplayName(selected);
      filterCustomerInitial = filterCustomerName.charAt(0) || '客';
      filterAvatarUrl = selected.avatarUrl ? String(selected.avatarUrl).trim() : '';
      pickerSelectedId = customerId;
    } else if (singleCustomerMode) {
      filterCustomerName = '当前客户';
      filterCustomerInitial = '客';
      pickerSelectedId = customerId;
    } else {
      filterAvatarUrl = this.data.storeAvatarUrl || '';
    }
    this.setData({
      singleCustomerMode,
      filterCustomerName,
      filterCustomerInitial,
      filterAvatarUrl,
      pickerSelectedId
    });
  },

  async loadStoreInfo() {
    const storeId = app.globalData.storeId;
    if (!isValidStoreId(storeId)) return;
    try {
      const db = wx.cloud.database();
      const res = await db.collection(getProfileCollection()).doc(storeId).get();
      const avatarUrl = res.data && res.data.avatarUrl ? String(res.data.avatarUrl).trim() : '';
      this.setData({ storeAvatarUrl: avatarUrl });
    } catch (e) {
      console.warn('[gallery] 加载门店信息失败', e);
    }
  },

  async loadFilterCustomerFromDb(customerId) {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('customers').doc(customerId).get();
      const name = getCustomerDisplayName(res.data);
      app.globalData.galleryFilterCustomer = res.data;
      this.setData({
        filterCustomerName: name,
        filterCustomerInitial: name.charAt(0) || '客',
        filterAvatarUrl: res.data.avatarUrl ? String(res.data.avatarUrl).trim() : ''
      });
    } catch (e) {
      console.warn('加载筛选客户失败', e);
    }
  },

  async loadBatches(isLoadMore = false, tab, silent = false) {
    const currentTab = tab || this.data.activeTab;
    const loadingKey = currentTab === 'time' ? 'timeLoading' : 'favLoading';
    const groupsKey = currentTab === 'time' ? 'timeGroups' : 'favGroups';
    const hasMoreKey = currentTab === 'time' ? 'timeHasMore' : 'favHasMore';
    const pageKey = currentTab === 'time' ? 'timePage' : 'favPage';

    if (this.data[loadingKey] && !silent) return;

    if (!silent) {
      this.setData({ [loadingKey]: true });
    }

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const storeId = app.globalData.storeId;
      if (!isValidStoreId(storeId)) {
        this.setData({ [loadingKey]: false, [groupsKey]: [], [`${currentTab}Refreshing`]: false });
        return;
      }

      const customerId = app.globalData.galleryFilterCustomerId || null;
      if (customerId && !app.globalData.galleryFilterCustomer) {
        await this.loadFilterCustomerFromDb(customerId);
      }

      let query = db.collection('batches').where({ storeId });
      if (customerId) {
        query = query.where({ customerId });
      }

      if (currentTab === 'fav') {
        query = query.where({ isFavorite: true });
      }

      const currentPage = isLoadMore ? this.data[pageKey] + 1 : 1;
      const skip = (currentPage - 1) * this.data.pageSize;
      const res = await query.orderBy('createTime', 'desc').skip(skip).limit(this.data.pageSize).get();

      let batches = await this.formatBatches(res.data);
      batches = this.applyBatchCustomerPatch(batches);
      if (silent) {
        this._kickWorkerForGenerating(batches);
      }
      const batchGroups = this.groupBatchesByMonth(batches);

      let mergedGroups;
      if (isLoadMore) {
        mergedGroups = this.mergeGroups(this.data[groupsKey], batchGroups);
      } else {
        mergedGroups = batchGroups;
      }

      this.setData({
        [groupsKey]: mergedGroups,
        [hasMoreKey]: batches.length === this.data.pageSize,
        [pageKey]: currentPage,
        [loadingKey]: false,
        [`${currentTab}Refreshing`]: false
      });

      this._updateAutoRefresh();
    } catch (error) {
      console.error('加载批次失败:', error);
      this.setData({ [loadingKey]: false, [`${currentTab}Refreshing`]: false });
      if (!silent) wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  async fetchCustomersByIds(ids) {
    const uniq = [...new Set((ids || []).filter(Boolean))];
    if (!uniq.length) return {};
    const db = wx.cloud.database();
    const map = {};
    await Promise.all(
      uniq.map(async (id) => {
        try {
          const res = await db.collection('customers').doc(id).get();
          if (res.data) map[id] = res.data;
        } catch (e) {
          console.warn('加载客户失败:', id, e);
        }
      })
    );
    return map;
  },

  applyBatchCustomerPatch(batches) {
    const linked = app.globalData.galleryBatchLinked;
    if (!linked || !linked.batchId || !linked.customer) return batches;
    const customer = linked.customer;
    const customerName = getCustomerDisplayName(customer);
    const customerInitial = customerName.charAt(0) || '客';
    const customerAvatarUrl = (customer && customer.avatarUrl) ? String(customer.avatarUrl).trim() : '';
    const hasValidCustomer = customerName !== '匿名用户';
    app.globalData.galleryBatchLinked = null;
    return batches.map((batch) => {
      if (batch._id !== linked.batchId) return batch;
      return {
        ...batch,
        customerId: customer._id,
        customerName,
        customerInitial,
        customerAvatarUrl,
        hasValidCustomer,
        customerLinkLabel: hasValidCustomer ? '更换客户' : '关联客户',
        avatarColor: pickAvatarColor(customer._id)
      };
    });
  },

  async formatBatches(batches) {
    if (!batches.length) return [];
    const db = wx.cloud.database();
    const batchIds = batches.map((b) => b._id);

    const photoMap = await fetchPhotosByBatchIds(db, batchIds);

    const customerIds = [...new Set(batches.map((b) => b.customerId).filter(Boolean))];
    const customerMap = await this.fetchCustomersByIds(customerIds);

    return batches.map((batch) => {
      const photos = photoMap[batch._id] || [];
      const sorted = [...photos].sort((a, b) => {
        const ta = new Date(a.createTime).getTime();
        const tb = new Date(b.createTime).getTime();
        return ta - tb;
      });
      const withAi = sorted.filter((p) => p.aiUrl || p.isGenerated);
      const coverPhoto = withAi[withAi.length - 1] || sorted[0];
      const coverUrl = coverPhoto ? coverPhoto.aiUrl || coverPhoto.originalUrl : '';
      const thumbUrls = sorted
        .map((p) => p.aiUrl || p.originalUrl)
        .filter(Boolean)
        .slice(0, 4);
      const extraCount = Math.max(0, sorted.length - 4);
      const batchIsFavorite = !!batch.isFavorite;

      const { status, generatedCount, photoCount, progressPercent } = deriveBatchStatus(sorted);
      const customer = customerMap[batch.customerId];
      const customerName = getCustomerDisplayName(customer);
      const customerInitial = customerName.charAt(0) || '客';
      const customerAvatarUrl = (customer && customer.avatarUrl) ? String(customer.avatarUrl).trim() : '';
      const hasValidCustomer = customerName !== '匿名用户';
      const customerLinkLabel = hasValidCustomer ? '更换客户' : '关联客户';

      return {
        ...batch,
        status,
        generatedCount,
        photoCount,
        progressPercent,
        coverUrl,
        thumbUrls,
        extraCount,
        isFavorite: batchIsFavorite,
        customerName,
        customerInitial,
        customerAvatarUrl,
        hasValidCustomer,
        customerLinkLabel,
        avatarColor: pickAvatarColor(batch.customerId || batch._id),
        timeLabel: buildTimeLabel(batch.createTime),
        summaryText: buildSummaryText(sorted, generatedCount, photoCount, batchIsFavorite)
      };
    });
  },

  groupBatchesByMonth(batches) {
    const groups = {};
    batches.forEach((batch) => {
      const date = new Date(batch.createTime);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const monthLabel = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      if (!groups[monthKey]) groups[monthKey] = { month: monthLabel, batches: [] };
      groups[monthKey].batches.push(batch);
    });
    return Object.keys(groups)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => groups[key]);
  },

  mergeGroups(existingGroups, newGroups) {
    const merged = [...existingGroups];
    newGroups.forEach((newGroup) => {
      const idx = merged.findIndex((g) => g.month === newGroup.month);
      if (idx !== -1) {
        merged[idx].batches = [...merged[idx].batches, ...newGroup.batches];
      } else {
        merged.push(newGroup);
      }
    });
    return merged.sort((a, b) => b.month.localeCompare(a.month));
  },

  _collectAllBatches() {
    const list = [];
    (this.data.timeGroups || []).forEach((g) => list.push(...(g.batches || [])));
    (this.data.favGroups || []).forEach((g) => list.push(...(g.batches || [])));
    return list;
  },

  _hasGeneratingBatches() {
    return this._collectAllBatches().some((b) => b.status === 'generating');
  },

  _kickWorkerForGenerating(batches) {
    const now = Date.now();
    if (this._lastGalleryKickAt && now - this._lastGalleryKickAt < 12000) return;
    const hit = (batches || []).find((b) => b.status === 'generating');
    if (!hit || !hit._id) return;
    this._lastGalleryKickAt = now;
    kickPortraitWorker({ batchId: hit._id });
  },

  _clearAutoRefresh() {
    if (this._autoRefreshTimer) {
      clearInterval(this._autoRefreshTimer);
      this._autoRefreshTimer = null;
    }
  },

  _updateAutoRefresh() {
    this._clearAutoRefresh();
    if (!this._hasGeneratingBatches()) {
      this._autoRefreshStartedAt = null;
      return;
    }
    if (!this._autoRefreshStartedAt) {
      this._autoRefreshStartedAt = Date.now();
    }
    const elapsed = Date.now() - this._autoRefreshStartedAt;
    if (elapsed >= AUTO_REFRESH_MAX_DURATION_MS) {
      return;
    }
    this._autoRefreshTimer = setInterval(() => {
      const e = Date.now() - this._autoRefreshStartedAt;
      if (e >= AUTO_REFRESH_MAX_DURATION_MS) {
        this._clearAutoRefresh();
        return;
      }
      if (!this._hasGeneratingBatches()) {
        this._clearAutoRefresh();
        this._autoRefreshStartedAt = null;
        return;
      }
      const tab = this.data.activeTab;
      this.loadBatches(false, tab, true);
    }, AUTO_REFRESH_INTERVAL_MS);
  },

  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index, 10);
    if (index === this.data.activeTabIndex) return;
    this._doSwitchTab(index);
  },

  onSwiperChange(e) {
    const index = e.detail.current;
    if (index === this.data.activeTabIndex) return;
    this._doSwitchTab(index);
  },

  _doSwitchTab(index) {
    const tabs = ['time', 'fav'];
    const tab = tabs[index];
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab, activeTabIndex: index });
    if (tab === 'time' && this.data.timeGroups.length === 0) {
      this.loadBatches(false, 'time');
    } else if (tab === 'fav' && this.data.favGroups.length === 0) {
      this.loadBatches(false, 'fav');
    } else {
      this._updateAutoRefresh();
    }
  },

  onRefresh() {
    const tab = this.data.activeTab;
    const key = tab === 'time' ? 'timeRefreshing' : 'favRefreshing';
    this.setData({ [key]: true });
    this._autoRefreshStartedAt = null;
    const groupsKey = tab === 'time' ? 'timeGroups' : 'favGroups';
    const hasMoreKey = tab === 'time' ? 'timeHasMore' : 'favHasMore';
    const pageKey = tab === 'time' ? 'timePage' : 'favPage';
    this.setData({ [groupsKey]: [], [hasMoreKey]: true, [pageKey]: 0 });
    this.loadBatches(false, tab);
  },

  onScrollLower() {
    const tab = this.data.activeTab;
    const loadingKey = tab === 'time' ? 'timeLoading' : 'favLoading';
    const hasMoreKey = tab === 'time' ? 'timeHasMore' : 'favHasMore';
    if (!this.data[hasMoreKey] || this.data[loadingKey]) return;
    this.loadBatches(true, tab);
  },

  onFilterRowTap() {
    this.setData({ pickerVisible: true });
  },

  onPickerSelect(e) {
    const { customer, allStore } = e.detail || {};
    if (allStore) {
      app.globalData.galleryFilterCustomerId = null;
      app.globalData.galleryFilterCustomer = null;
    } else if (customer && customer._id) {
      app.globalData.galleryFilterCustomerId = customer._id;
      app.globalData.galleryFilterCustomer = customer;
    }
    this.setData({ pickerVisible: false });
    this.syncFilterContext();
    this.refreshData();
  },

  onPickerClose() {
    this.setData({ pickerVisible: false });
  },

  onBatchTap(e) {
    const batch = e.currentTarget.dataset.batch;
    wx.navigateTo({
      url: `/packageStore/pages/cloud/portrait-viewer/portrait-viewer?mode=batch&batchId=${batch._id}`
    });
  },

  onBatchMenu(e) {
    const batch = e.currentTarget.dataset.batch;
    if (!batch || !batch._id) return;
    const favLabel = batch.isFavorite ? '取消收藏' : '收藏批次';
    const linkLabel = batch.customerLinkLabel || (batch.hasValidCustomer ? '更换客户' : '关联客户');
    wx.showActionSheet({
      itemList: [favLabel, '全部下载', linkLabel],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.toggleBatchFavorite(batch);
        } else if (res.tapIndex === 1) {
          this.onDownloadBatch({ currentTarget: { dataset: { batch } } });
        } else if (res.tapIndex === 2) {
          this.openBatchCustomerPicker(batch._id);
        }
      }
    });
  },

  async toggleBatchFavorite(batch) {
    if (!batch || !batch._id) return;
    const next = !batch.isFavorite;
    try {
      await setBatchFavorite(batch._id, next);
      wx.showToast({ title: next ? '已收藏' : '已取消收藏', icon: 'success' });
      this.refreshData();
    } catch (err) {
      console.warn('[gallery] toggleBatchFavorite', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  openBatchCustomerPicker(batchId) {
    wx.navigateTo({
      url: `/packageStore/pages/profile/customer-list/customer-list?selectMode=true&purpose=batchLink&batchId=${encodeURIComponent(batchId)}`
    });
  },

  async onDownloadBatch(e) {
    const batch = e.currentTarget.dataset.batch;
    wx.showLoading({ title: '获取照片...' });
    try {
      const db = wx.cloud.database();
      const photos = await fetchPhotosByBatchId(db, batch._id);
      if (photos.length === 0) {
        wx.showToast({ title: '没有可下载的照片', icon: 'none' });
        return;
      }
      const urls = photos.map((p) => p.aiUrl || p.originalUrl).filter(Boolean);
      wx.showActionSheet({
        itemList: ['全部下载', '选择单张下载'],
        success: async (actionRes) => {
          if (actionRes.tapIndex === 0) {
            await this.downloadImages(urls);
          } else if (actionRes.tapIndex === 1) {
            const itemList = urls.map((_, idx) => `照片${idx + 1}`);
            wx.showActionSheet({
              itemList,
              success: async (sheetRes) => {
                if (sheetRes.tapIndex !== -1) await this.downloadImage(urls[sheetRes.tapIndex]);
              }
            });
          }
        }
      });
    } catch (error) {
      console.error('下载失败:', error);
      wx.showToast({ title: '下载失败', icon: 'error' });
    } finally {
      wx.hideLoading();
    }
  },

  async downloadImages(urls) {
    wx.showLoading({ title: `下载中 0/${urls.length}` });
    let count = 0;
    for (let i = 0; i < urls.length; i++) {
      try {
        await this.downloadImage(urls[i]);
        count++;
        wx.showLoading({ title: `下载中 ${count}/${urls.length}` });
      } catch (err) {
        console.error('单张下载失败:', err);
      }
    }
    wx.hideLoading();
    wx.showToast({ title: `成功下载${count}张`, icon: 'success' });
  },

  downloadImage(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) =>
          wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath, success: resolve, fail: reject }),
        fail: reject
      });
    });
  },

  async refreshData() {
    this.syncFilterContext();
    const tab = this.data.activeTab;
    const groupsKey = tab === 'time' ? 'timeGroups' : 'favGroups';
    const hasMoreKey = tab === 'time' ? 'timeHasMore' : 'favHasMore';
    const pageKey = tab === 'time' ? 'timePage' : 'favPage';
    this.setData({ [groupsKey]: [], [hasMoreKey]: true, [pageKey]: 0 });
    await this.loadBatches(false, tab);
  }
});
