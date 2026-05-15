Page({
  data: {
    originalUrl: '',
    count: 3
  },

  onLoad(options) {
    const originalUrl = decodeURIComponent(options.originalUrl || '');
    const count = Number(options.count || 3) === 9 ? 9 : 3;
    this.setData({ originalUrl, count });
    wx.setNavigationBarTitle({ title: '更换原图' });
  },

  onTapPreviewBox() {
    this.chooseNewOriginal();
  },

  chooseNewOriginal() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file || !file.tempFilePath) {
          wx.showToast({ title: '未获取到图片', icon: 'none' });
          return;
        }
        wx.setStorageSync('changedOriginalUrl', file.tempFilePath);
        wx.setStorageSync('changedStyleCount', this.data.count);
        wx.navigateBack();
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '选择失败', icon: 'none' });
      }
    });
  }
});
