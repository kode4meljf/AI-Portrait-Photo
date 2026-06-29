const { AGREEMENT_TEXT } = require('../../../utils/helpCenter')

Page({
  behaviors: [require('../../../../behaviors/pageShare')],
  data: { text: AGREEMENT_TEXT },

  onLoad() {
    wx.setNavigationBarTitle({ title: '用户协议' })
  },
})
