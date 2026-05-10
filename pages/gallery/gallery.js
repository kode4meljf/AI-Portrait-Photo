// pages/gallery/gallery.js （完整版，基于用户提供的文件修改）

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
    batchGroups: [],
    loading: false,
    hasMore: true,
    pageSize: 20,
    currentPage: 0,
    refreshing: false,
  },

  onLoad() {
    this.loadBatches();
  },

  onShow() {
    // 每次显示都刷新，确保新上传的照片立即出现
    this.refreshData();
  },

  async loadBatches(isLoadMore = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const db = wx.cloud.database();
      const _ = db.command;
      const storeId = app.globalData.storeId;
      console.log("查询批次，storeId:", storeId);

      if (!storeId || storeId === "mock_store_id") {
        console.warn("storeId无效，跳过查询");
        this.setData({ loading: false, batchGroups: [] });
        return;
      }

      let query = db.collection("batches").where({ storeId });

      if (app.globalData.selectedCustomerId) {
        query = query.where({ customerId: app.globalData.selectedCustomerId });
      }

      if (this.data.activeTab === "fav") {
        const photosRes = await db
          .collection("photos")
          .where({ isFavorite: true })
          .field({ batchId: true })
          .get();
        const favBatchIds = [...new Set(photosRes.data.map((p) => p.batchId))];
        if (favBatchIds.length === 0) {
          this.setData({ batchGroups: [], loading: false, hasMore: false });
          return;
        }
        query = query.where({ _id: _.in(favBatchIds) });
      }

      const skip = isLoadMore ? this.data.currentPage * this.data.pageSize : 0;
      const res = await query
        .orderBy("createTime", "desc")
        .skip(skip)
        .limit(this.data.pageSize)
        .get();

      const batches = await this.formatBatches(res.data);
      const batchGroups = this.groupBatchesByMonth(batches);

      if (isLoadMore) {
        const existingGroups = this.data.batchGroups;
        const mergedGroups = this.mergeGroups(existingGroups, batchGroups);
        this.setData({ batchGroups: mergedGroups });
      } else {
        this.setData({ batchGroups });
      }

      this.setData({
        hasMore: batches.length === this.data.pageSize,
        currentPage: isLoadMore ? this.data.currentPage + 1 : 1,
      });
    } catch (error) {
      console.error("加载批次失败:", error);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false, refreshing: false });
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
      return {
        ...batch,
        createTimeStr,
        coverUrl,
        thumbnails,
        photoCount: photos.length,
        generatedCount,
      };
    });
  },

  groupBatchesByMonth(batches) {
    const groups = {};
    batches.forEach((batch) => {
      const date = new Date(batch.createTime);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const monthLabel = `${date.getFullYear()}年${date.getMonth() + 1}`;
      if (!groups[monthKey]) {
        groups[monthKey] = { month: monthLabel, batches: [] };
      }
      groups[monthKey].batches.push(batch);
    });
    const sortedMonths = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedMonths.map((key) => groups[key]);
  },

  mergeGroups(existingGroups, newGroups) {
    const merged = [...existingGroups];
    newGroups.forEach((newGroup) => {
      const existingIdx = merged.findIndex((g) => g.month === newGroup.month);
      if (existingIdx !== -1) {
        merged[existingIdx].batches = [...merged[existingIdx].batches, ...newGroup.batches];
      } else {
        merged.push(newGroup);
      }
    });
    return merged.sort((a, b) => b.month.localeCompare(a.month));
  },

  switchTab(e) {
    const activeTab = e.currentTarget.dataset.tab;
    this.setData({ activeTab, batchGroups: [], hasMore: true, currentPage: 0 });
    this.loadBatches();
  },

  onBatchTap(e) {
    const batch = e.currentTarget.dataset.batch;
    wx.navigateTo({
      url: `/packageCloud/pages/browse/browse?batchId=${batch._id}`,
    });
  },

  async onDownloadBatch(e) {
    const batch = e.currentTarget.dataset.batch;
    const batchId = batch._id;
    wx.showLoading({ title: "获取照片..." });
    try {
      const db = wx.cloud.database();
      const res = await db.collection("photos").where({ batchId }).get();
      const photos = res.data;
      if (photos.length === 0) {
        wx.showToast({ title: "没有可下载的照片", icon: "none" });
        return;
      }
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
                if (sheetRes.tapIndex !== -1) {
                  await this.downloadImage(urls[sheetRes.tapIndex]);
                }
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
    let successCount = 0;
    for (let i = 0; i < urls.length; i++) {
      try {
        await this.downloadImage(urls[i]);
        successCount++;
        wx.showLoading({ title: `下载中 ${successCount}/${urls.length}` });
      } catch (err) {
        console.error("单张下载失败:", err);
      }
    }
    wx.hideLoading();
    wx.showToast({ title: `成功下载${successCount}张`, icon: "success" });
  },

  downloadImage(url) {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => {
          wx.saveImageToPhotosAlbum({
            filePath: res.tempFilePath,
            success: resolve,
            fail: reject,
          });
        },
        fail: reject,
      });
    });
  },

  refreshData() {
    this.setData({ batchGroups: [], hasMore: true, currentPage: 0 });
    this.loadBatches();
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true });
    this.refreshData();
    wx.stopPullDownRefresh();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadBatches(true);
    }
  },
});