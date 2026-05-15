const STYLE_LIST = [
  { id: 'pilot', name: '机长照', cover: 'https://picsum.photos/800/1200?random=311' },
  { id: 'hk', name: '港风街拍', cover: 'https://picsum.photos/800/1200?random=312' },
  { id: 'french', name: '法式复古', cover: 'https://picsum.photos/800/1200?random=313' },
  { id: 'korean', name: '清冷韩系', cover: 'https://picsum.photos/800/1200?random=314' },
  { id: 'japan', name: '日系通勤', cover: 'https://picsum.photos/800/1200?random=315' },
  { id: 'film', name: '胶片人像', cover: 'https://picsum.photos/800/1200?random=316' },
  { id: 'chinese', name: '新中式写真', cover: 'https://picsum.photos/800/1200?random=317' },
  { id: 'idphoto', name: '轻奢证件照', cover: 'https://picsum.photos/800/1200?random=318' },
  { id: 'cinema', name: '电影质感', cover: 'https://picsum.photos/800/1200?random=319' }
];

Page({
  data: {
    originalUrl: '',
    count: 3,
    styles: [],
    currentIndex: 0,
    currentStyleName: ''
  },

  onLoad(options) {
    const originalUrl = decodeURIComponent(options.originalUrl || '');
    const count = Number(options.count || 3) === 9 ? 9 : 3;
    const styles = STYLE_LIST.slice(0, count);
    const currentStyleName = styles[0]?.name || '';
    this.setData({
      originalUrl,
      count,
      styles,
      currentStyleName
    });
    this.updateNavTitle(currentStyleName);
  },

  onShow() {
    const changedUrl = wx.getStorageSync('changedOriginalUrl');
    const changedCount = Number(wx.getStorageSync('changedStyleCount') || 0);
    const nextData = {};

    if (changedUrl) {
      nextData.originalUrl = changedUrl;
      wx.removeStorageSync('changedOriginalUrl');
    }

    if (changedCount === 3 || changedCount === 9) {
      const styles = STYLE_LIST.slice(0, changedCount);
      let nextIndex = this.data.currentIndex;
      if (nextIndex >= styles.length) nextIndex = 0;
      nextData.count = changedCount;
      nextData.styles = styles;
      nextData.currentIndex = nextIndex;
      nextData.currentStyleName = styles[nextIndex]?.name || '';
      wx.removeStorageSync('changedStyleCount');
    }

    if (Object.keys(nextData).length) {
      this.setData(nextData, () => {
        this.updateNavTitle(this.data.currentStyleName);
      });
      return;
    }

    this.updateNavTitle(this.data.currentStyleName);
  },

  updateNavTitle(styleName) {
    wx.setNavigationBarTitle({
      title: styleName || '风格页'
    });
  },

  switchCount(e) {
    const count = Number(e.currentTarget.dataset.count || 3);
    if (count === this.data.count) return;
    const styles = STYLE_LIST.slice(0, count);
    let nextIndex = this.data.currentIndex;
    if (nextIndex >= styles.length) nextIndex = 0;
    const currentStyleName = styles[nextIndex]?.name || '';
    this.setData({
      count,
      styles,
      currentIndex: nextIndex,
      currentStyleName
    });
    this.updateNavTitle(currentStyleName);
  },

  onThumbTap(e) {
    const index = Number(e.currentTarget.dataset.index || 0);
    const style = this.data.styles[index];
    if (!style) return;
    this.setData({
      currentIndex: index,
      currentStyleName: style.name
    });
    this.updateNavTitle(style.name);
  },

  onSwiperChange(e) {
    const index = Number(e.detail.current || 0);
    const style = this.data.styles[index];
    if (!style) return;
    this.setData({
      currentIndex: index,
      currentStyleName: style.name
    });
    this.updateNavTitle(style.name);
  },

  onChangeOriginal() {
    const originalUrl = encodeURIComponent(this.data.originalUrl || '');
    wx.navigateTo({
      url: `/pages/cloud/change-original/change-original?originalUrl=${originalUrl}&count=${this.data.count}`
    });
  },

  onStartGenerate() {
    wx.showToast({ title: '开始生成（待接入）', icon: 'none' });
  }
});
