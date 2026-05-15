const SAMPLE_LIST = [
  {
    url: 'https://picsum.photos/seed/change-sample-ok1/300/300',
    good: true,
    caption: '微笑、清晰'
  },
  {
    url: 'https://picsum.photos/seed/change-sample-bad/300/300',
    good: false,
    caption: '不正视'
  },
  {
    url: 'https://picsum.photos/seed/change-sample-ok2/300/300',
    good: true,
    caption: '微笑、清晰'
  },
  {
    url: 'https://picsum.photos/seed/change-sample-ok3/300/300',
    good: true,
    caption: '微笑、清晰'
  }
];

Page({
  data: {
    originalUrl: '',
    pendingPath: '',
    displayUrl: '',
    count: 3,
    sampleList: SAMPLE_LIST
  },

  onLoad(options) {
    const originalUrl = decodeURIComponent(options.originalUrl || '');
    const count = Number(options.count || 3) === 9 ? 9 : 3;
    this.setData({
      originalUrl,
      count,
      pendingPath: '',
      displayUrl: originalUrl || ''
    });
    wx.setNavigationBarTitle({ title: '更换原图' });
  },

  onTapUpload() {
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
        this.setData({
          pendingPath: file.tempFilePath,
          displayUrl: file.tempFilePath
        });
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.includes('cancel')) return;
        wx.showToast({ title: '选择失败', icon: 'none' });
      }
    });
  },

  onSave() {
    if (this.data.pendingPath) {
      wx.setStorageSync('changedOriginalUrl', this.data.pendingPath);
      wx.setStorageSync('changedStyleCount', this.data.count);
    }
    wx.navigateBack();
  }
});
