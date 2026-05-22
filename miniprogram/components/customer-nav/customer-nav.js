Component({
  properties: {
    current: { type: String, value: 'home' }
  },

  data: {
    tabs: [
      { key: 'home', text: '首页', path: '/packageCustomer/pages/home/home' },
      { key: 'gallery', text: '云相册', path: '/packageCustomer/pages/gallery/gallery' },
      { key: 'orders', text: '订单', path: '/packageCustomer/pages/order-list/order-list' },
      { key: 'profile', text: '我的', path: '/packageCustomer/pages/profile/profile' }
    ]
  },

  methods: {
    onTap(e) {
      const path = e.currentTarget.dataset.path
      if (!path) return
      const pages = getCurrentPages()
      const cur = pages[pages.length - 1]
      if (cur && `/${cur.route}` === path) return
      wx.redirectTo({ url: path })
    }
  }
})
