// pages/gallery/gallery.js

const app = getApp();

const formatDate = (date, pattern = "yyyy-MM-dd") => {
  if (!date) return "";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return pattern
    .replace("yyyy", year)
    .replace("MM", month)
    .replace("dd", day)
    .replace("HH", hour)
    .replace("mm", minute);
};

Page({
  data: {
    activeTab: "time",
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
  },

  onLoad() {
    this.loadBatches(false, "time");
  },

  onShow() {
    this.refreshData();
  },

  async loadBatches(isLoadMore = false, tab) {
    const currentTab = tab || this.data.activeTab;
    const loadingKey = currentTab === "time" ? "timeLoading" : "favLoading";
    const groupsKey = currentTab === "time" ? "timeGroups" : "favGroups";
    const hasMoreKey = currentTab === "time" ? "timeHasMore" : "favHasMore";
    const pageKey = currentTab === "time" ? "timePage" : "favPage";

    if (this.data[loadingKey]) return;
    this.setData({ [loadingKey]: true });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const storeId = app.globalData.storeId;
      if (!storeId || storeId === "mock_store_id") {
        this.setData({ [loadingKey]: false, [groupsKey]: [], [`${currentTab}Refreshing`]: false });
        return;
      }

      let query = db.collection("batches").where({ storeId });
      if (app.globalData.selectedCustomerId) {
        query = query.where({ customerId: app.globalData.selectedCustomerId });
      }

      if (currentTab === "fav") {
        const photosRes = await db
          .collection("photos")
          .where({ isFavorite: true })
          .field({ batchId: true })
          .get();
        const favBatchIds = [...new Set(photosRes.data.map((p) => p.batchId))];
        if (favBatchIds.length === 0) {
          this.setData({ [groupsKey]: [], [loadingKey]: false, [hasMoreKey]: false, [`${currentTab}Refreshing`]: false });
          return;
        }
        query = query.where({ _id: _.in(favBatchIds) });
      }

      const currentPage = isLoadMore ? this.data[pageKey] + 1 : 1;
      const skip = (currentPage - 1) * this.data.pageSize;
      const res = await query
        .orderBy("createTime", "desc")
        .skip(skip)
        .limit(this.data.pageSize)
        .get();

      const batches = await this.formatBatches(res.data);
      const batchGroups = this.groupBatchesByMonth(batches);

      let existingGroups = this.data[groupsKey];
      let mergedGroups;
      if (isLoadMore) {
        mergedGroups = this.mergeGroups(existingGroups, batchGroups);
      } else {
        mergedGroups = batchGroups;
      }

      this.setData({
        [groupsKey]: mergedGroups,
        [hasMoreKey]: batches.length === this.data.pageSize,
        [pageKey]: currentPage,
        [loadingKey]: false,
        [`${currentTab}Refreshing`]: false,
      });
    } catch (error) {
      console.error("加载批次失败:", error);
      this.setData({ [loadingKey]: false, [`${currentTab}Refreshing`]: false });
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async formatBatches(batches) {
    if (!batches.length) return [];
    const db = wx.cloud.database();
    const batchIds = batches.map((b) => b._id);
    const photosRes = await db
      .collection("photos")
      .where({ batchId: db.command.in(batchIds) })
      .orderBy("createTime", "asc")
      .get();
    const photoMap = {};
    photosRes.data.forEach((photo) => {
      if (!photoMap[photo.batchId]) photoMap[photo.batchId] = [];
      photoMap[photo.batchId].push(photo);
    });
    return batches.map((batch) => {
      const photos = photoMap[batch._id] || [];
      const coverUrl = photos.length > 0 ? photos[0].aiUrl || photos[0].originalUrl : "";
      const thumbnails = photos.slice(0, 8).map((p) => p.aiUrl || p.originalUrl);
      const generatedCount = photos.filter((p) => p.isGenerated === true).length;
      const createTimeStr = formatDate(batch.createTime, "yyyy-MM-dd");
      return { ...batch, createTimeStr, coverUrl, thumbnails, photoCount: photos.length, generatedCount };
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
    return Object.keys(groups).sort((a, b) => b.localeCompare(a)).map((key) => groups[key]);
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

  // 切换 Tab（点击）
  switchTab(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    if (index === this.data.activeTabIndex) return;
    this._doSwitchTab(index);
  },

  // Tab 滑动切换
  onSwiperChange(e) {
    const index = e.detail.current;
    if (index === this.data.activeTabIndex) return;
    this._doSwitchTab(index);
  },

  _doSwitchTab(index) {
    const tabs = ["time", "fav"];
    const tab = tabs[index];
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab, activeTabIndex: index });
    if (tab === "time" && this.data.timeGroups.length === 0) {
      this.loadBatches(false, "time");
    } else if (tab === "fav" && this.data.favGroups.length === 0) {
      this.loadBatches(false, "fav");
    }
  },

  // 下拉刷新（两个 scroll-view 共用）
  onRefresh(e) {
    const tab = this.data.activeTab;
    const key = tab === "time" ? "timeRefreshing" : "favRefreshing";
    this.setData({ [key]: true });
    const groupsKey = tab === "time" ? "timeGroups" : "favGroups";
    const hasMoreKey = tab === "time" ? "timeHasMore" : "favHasMore";
    const pageKey = tab === "time" ? "timePage" : "favPage";
    this.setData({ [groupsKey]: [], [hasMoreKey]: true, [pageKey]: 0 });
    this.loadBatches(false, tab);
  },

  // 触底加载
  onScrollLower(e) {
    const tab = this.data.activeTab;
    const loadingKey = tab === "time" ? "timeLoading" : "favLoading";
    const hasMoreKey = tab === "time" ? "timeHasMore" : "favHasMore";
    if (!this.data[hasMoreKey] || this.data[loadingKey]) return;
    this.loadBatches(true, tab);
  },

  onBatchTap(e) {
    const batch = e.currentTarget.dataset.batch;
    wx.navigateTo({ url: `/packageCloud/pages/browse/browse?batchId=${batch._id}` });
  },

  async onDownloadBatch(e) {
    const batch = e.currentTarget.dataset.batch;
    wx.showLoading({ title: "获取照片..." });
    try {
      const db = wx.cloud.database();
      const res = await db.collection("photos").where({ batchId: batch._id }).get();
      const photos = res.data;
      if (photos.length === 0) { wx.showToast({ title: "没有可下载的照片", icon: "none" }); return; }
      const urls = photos.map((p) => p.aiUrl || p.originalUrl);
      wx.showActionSheet({
        itemList: ["全部下载", "选择单张下载"],
        success: async (actionRes) => {
          if (actionRes.tapIndex === 0) {
            await this.downloadImages(urls);
          } else if (actionRes.tapIndex === 1) {
            const itemList = urls.map((_, idx) => `照片${idx + 1}`);
            wx.showActionSheet({
              itemList,
              success: async (sheetRes) => {
                if (sheetRes.tapIndex !== -1) await this.downloadImage(urls[sheetRes.tapIndex]);
              },
            });
          }
        },
      });
    } catch (error) {
      console.error("下载失败:", error);
      wx.showToast({ title: "下载失败", icon: "error" });
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
      } catch (err) { console.error("单张下载失败:", err); }
    }
    wx.hideLoading();
    wx.showToast({ title: `成功下载${count}张`, icon: "success" });
  },

  downloadImage(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath, success: resolve, fail: reject }),
        fail: reject,
      });
    });
  },

  async refreshData() {
    const tab = this.data.activeTab;
    const groupsKey = tab === "time" ? "timeGroups" : "favGroups";
    const hasMoreKey = tab === "time" ? "timeHasMore" : "favHasMore";
    const pageKey = tab === "time" ? "timePage" : "favPage";
    this.setData({ [groupsKey]: [], [hasMoreKey]: true, [pageKey]: 0 });
    await this.loadBatches(false, tab);
  },
});
