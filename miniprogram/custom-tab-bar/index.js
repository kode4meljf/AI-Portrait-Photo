Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页' },
      { pagePath: '/pages/gallery/gallery', text: '云相册' },
      { pagePath: '/pages/order-list/order-list', text: '订单' },
      { pagePath: '/pages/profile/profile', text: '我的' }
    ]
  },

  methods: {
    onTap(e) {
      const { path, index } = e.currentTarget.dataset
      if (!path || index === this.data.selected) return
      wx.switchTab({ url: path })
    }
  }
})
