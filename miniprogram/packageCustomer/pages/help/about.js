const { getAppVersion, ABOUT_DESC } = require('../../../utils/helpCenter')
const { fetchPlatformSupportPhone } = require('../../../utils/platformSettings')

Page({
  data: {
    version: '1.0.0',
    desc: ABOUT_DESC.customer,
    supportPhone: '暂未配置',
    serviceHours: '工作日 9:00–18:00',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '关于' })
    this.loadData()
  },

  async loadData() {
    const phone = await fetchPlatformSupportPhone()
    this.setData({
      version: getAppVersion(),
      supportPhone: phone || '暂未配置',
    })
  },

  onCallSupport() {
    const phone = this.data.supportPhone
    if (!phone || phone === '暂未配置') {
      wx.showToast({ title: '暂未配置客服电话', icon: 'none' })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone.replace(/\s/g, '') })
  },
})
