const { PRIVACY_TEXT } = require('../../../utils/helpCenter')

Page({
  data: { text: PRIVACY_TEXT },

  onLoad() {
    wx.setNavigationBarTitle({ title: '隐私政策' })
  },
})
