const { AGREEMENT_TEXT } = require('../../../utils/helpCenter')

Page({
  data: { text: AGREEMENT_TEXT },

  onLoad() {
    wx.setNavigationBarTitle({ title: '用户协议' })
  },
})
