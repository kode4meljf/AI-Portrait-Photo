/**
 * 顾客端页面：隐藏微信左上角「主页」按钮，避免跳回门店 tabBar。
 * 顾客分包非 tabBar 页，系统主页会指向 pages/index/index（门店端）。
 */
const CUSTOMER_HOME = '/packageCustomer/pages/home/home'

module.exports = Behavior({
  pageLifetimes: {
    show() {
      if (typeof wx.hideHomeButton === 'function') {
        wx.hideHomeButton()
      }
    }
  },

  methods: {
    onHomeIconButtonTap() {
      wx.reLaunch({ url: CUSTOMER_HOME })
    }
  }
})
