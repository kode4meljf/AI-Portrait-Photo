/**
 * @file 图片浏览页面
 * @description 展示批次内所有照片，支持多选、AI生成（异步任务）、收藏、生成相框
 */

const app = getApp();

Page({
  data: {
    batchId: "",
    currentIndex: 0,
    currentPhoto: null,
    photos: [],
    thumbnails: [],
    isSelectionMode: false,
    selectedIds: [],
    batchStatus: "pending",
    aiTaskId: null,
    currentStyleName: "天使装",
    templates: [],
    selectedTemplateId: null,
    pollingTimer: null,
    aiPollingTimer: null
  },

  onLoad(options) {
    this.setData({ batchId: options.batchId });
    this.loadPhotos();
    this.loadBatchStatus();
    this.loadTemplates();
  },

  onUnload() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.aiPollingTimer) clearInterval(this.aiPollingTimer);
  },

  onHide() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.aiPollingTimer) clearInterval(this.aiPollingTimer);
  },

  // ==================== 数据加载 ====================
  async loadTemplates() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection('templates').get();
      if (res.data && res.data.length) {
        this.setData({ templates: res.data });
      }
    } catch (err) {
      console.error('加载模板失败', err);
    }
  },

  async loadPhotos() {
    try {
      const db = wx.cloud.database();
      const res = await db.collection("photos")
        .where({ batchId: this.data.batchId })
        .orderBy("createTime", "asc")
        .get();

      const photos = res.data;
      const thumbnails = photos.map(photo => {
        const genStatus = photo.generateStatus || 'pending';
        let statusText = "", statusClass = "";
        if (genStatus === 'processing') {
          statusText = "生成中";
          statusClass = "processing";
        } else if (photo.isGenerated && photo.aiUrl) {
          statusText = "已完成";
          statusClass = "completed";
        } else if (genStatus === 'failed') {
          statusText = "失败";
          statusClass = "failed";
        } else {
          statusText = "未生成";
          statusClass = "pending";
        }
        return {
          url: photo.aiUrl || photo.originalUrl,
          id: photo._id,
          isGenerated: photo.isGenerated,
          generateStatus: genStatus,
          statusText,
          statusClass
        };
      });

      this.setData({
        photos,
        thumbnails,
        currentPhoto: photos[0] || null
      });

      const hasProcessing = photos.some(p => p.generateStatus === 'processing');
      if (hasProcessing && !this.pollingTimer) {
        this.startPolling();
      } else if (!hasProcessing && this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    } catch (error) {
      console.error("加载照片失败:", error);
    }
  },

  async loadBatchStatus() {
    const db = wx.cloud.database();
    const res = await db.collection("batches").doc(this.data.batchId).get();
    this.setData({ batchStatus: res.data.status });
    if (res.data.status === "generating") {
      this.startAIPolling();
    }
  },

  // ==================== 界面交互 ====================
  onSwiperChange(e) {
    const index = e.detail.current;
    this.setData({
      currentIndex: index,
      currentPhoto: this.data.photos[index]
    });
    this.updateStyleNameByIndex(index);
  },

  updateStyleNameByIndex(index) {
    const styleList = ["天使装", "公主风", "复古旗袍", "韩式简约", "法式浪漫", "古风侠客", "杂志封面", "油画质感", "清新自然"];
    const styleName = styleList[index % styleList.length];
    this.setData({ currentStyleName: styleName });
  },

  onThumbTap(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      currentIndex: index,
      currentPhoto: this.data.photos[index]
    });
    this.updateStyleNameByIndex(index);
  },

  onImageLongPress() {
    this.setData({
      isSelectionMode: true,
      selectedIds: []
    });
  },

  onSelectPhoto(e) {
    const photoId = e.currentTarget.dataset.id;
    let selectedIds = [...this.data.selectedIds];
    const idx = selectedIds.indexOf(photoId);
    if (idx !== -1) selectedIds.splice(idx, 1);
    else selectedIds.push(photoId);
    this.setData({ selectedIds });
  },

  // ==================== 模板选择 ====================
  promptSelectTemplate() {
    return new Promise((resolve) => {
      const { templates } = this.data;
      if (!templates.length) {
        wx.showToast({ title: '暂无模板，请稍后重试', icon: 'none' });
        resolve(null);
        return;
      }
      const itemList = templates.map(t => t.name);
      wx.showActionSheet({
        itemList,
        success: (res) => {
          const selected = templates[res.tapIndex];
          const templateId = selected.id;   // ✅ 使用自定义 id 字段
          resolve(templateId);
        },
        fail: () => resolve(null)
      });
    });
  },

  // ==================== AI生成（异步任务队列） ====================
  async generateAI() {
    const { selectedIds, selectedTemplateId } = this.data;
    if (selectedIds.length === 0) {
      wx.showToast({ title: "请先选择照片", icon: "none" });
      return;
    }

    let finalTemplateId = selectedTemplateId;
    if (!finalTemplateId) {
      finalTemplateId = await this.promptSelectTemplate();
      if (!finalTemplateId) {
        wx.showToast({ title: "未选择模板", icon: "none" });
        return;
      }
      this.setData({ selectedTemplateId: finalTemplateId });
    }

    wx.showLoading({ title: "提交任务中...", mask: true });
    try {
      for (const photoId of selectedIds) {
        await wx.cloud.callFunction({
          name: "submitAITask",
          data: { photoId, templateId: finalTemplateId }
        });
      }
      wx.hideLoading();
      wx.showToast({ title: `已提交 ${selectedIds.length} 个生成任务`, icon: "success" });
      // 立即刷新照片列表，此时状态应为 pending（等待处理）
      await this.loadPhotos();
      // 启动轮询（如果照片状态中有 processing，轮询会自动开始）
      this.startPolling();
      // 退出多选模式
      this.setData({ isSelectionMode: false, selectedIds: [] });
    } catch (err) {
      wx.hideLoading();
      console.error("提交任务失败:", err);
      wx.showToast({ title: "提交失败", icon: "error" });
    }
  },

  startPolling() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.pollingTimer = setInterval(async () => {
      await this.loadPhotos();
      const hasProcessing = this.data.photos.some(p => p.generateStatus === 'processing');
      if (!hasProcessing) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
        const allSuccess = this.data.photos.every(p => p.generateStatus === 'completed');
        if (allSuccess) {
          wx.showToast({ title: "所有图片生成完成", icon: "success" });
        }
      }
    }, 3000);
  },

  // ==================== 收藏 ====================
  async toggleFavorite() {
    const { selectedIds, photos } = this.data;
    if (selectedIds.length === 0) {
      wx.showToast({ title: "请选择图片", icon: "none" });
      return;
    }
    try {
      const db = wx.cloud.database();
      const firstPhoto = photos.find(p => p._id === selectedIds[0]);
      const newFavoriteState = !firstPhoto?.isFavorite;
      await db.collection("photos").where({
        _id: db.command.in(selectedIds)
      }).update({
        data: { isFavorite: newFavoriteState }
      });
      this.loadPhotos();
      wx.showToast({ title: newFavoriteState ? "已收藏" : "已取消收藏", icon: "success" });
    } catch (error) {
      console.error("收藏操作失败:", error);
      wx.showToast({ title: "操作失败", icon: "error" });
    }
  },

  // ==================== 生成相框 ====================
  createFrameOrder() {
    const { selectedIds, photos } = this.data;
    if (selectedIds.length === 0) {
      wx.showToast({ title: "请选择图片", icon: "none" });
      return;
    }
    const selectedUrls = selectedIds.map(id => {
      const photo = photos.find(p => p._id === id);
      return photo.aiUrl || photo.originalUrl;
    });
    wx.navigateTo({
      url: `/pages/order/frame-template/frame-template?photoUrls=${encodeURIComponent(JSON.stringify(selectedUrls))}`
    });
  },

  exitSelectionMode() {
    this.setData({ isSelectionMode: false, selectedIds: [] });
  },

  // ==================== 批次状态轮询（兼容原批次状态，可选） ====================
  startAIPolling() {
    if (this.aiPollingTimer) clearInterval(this.aiPollingTimer);
    this.aiPollingTimer = setInterval(async () => {
      const db = wx.cloud.database();
      const res = await db.collection("batches").doc(this.data.batchId).get();
      const status = res.data.status;
      if (status === "completed") {
        clearInterval(this.aiPollingTimer);
        this.aiPollingTimer = null;
        this.setData({ batchStatus: "completed" });
        this.loadPhotos();
        wx.showToast({ title: "批次AI生成完成", icon: "success" });
      } else if (status === "failed") {
        clearInterval(this.aiPollingTimer);
        this.aiPollingTimer = null;
        this.setData({ batchStatus: "failed" });
        wx.showToast({ title: "批次AI生成失败", icon: "error" });
      }
    }, 3000);
  }
});