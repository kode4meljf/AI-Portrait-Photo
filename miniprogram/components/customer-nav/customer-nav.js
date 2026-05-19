Component({
  properties: {
    current: { type: String, value: 'home' }
  },

  data: {
    tabs: [
      { key: 'home', text: '首页', icon: '⌂', path: '/packageCustomer/pages/home/home' },
      { key: 'showcase', text: '写真展', icon: '✦', path: '/packageCustomer/pages/showcase/showcase' },
      { key: 'gallery', text: '相册', icon: '▦', path: '/packageCustomer/pages/gallery/gallery' },
      { key: 'orders', text: '订单', icon: '☰', path: '/packageCustomer/pages/order-list/order-list' },
      { key: 'profile', text: '我的', icon: '○', path: '/packageCustomer/pages/profile/profile' }
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
