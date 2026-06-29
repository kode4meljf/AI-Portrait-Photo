const { submitFeedback } = require('../../utils/feedbackApi')

Page({
  behaviors: [require('../../../../behaviors/pageShare')],
  data: {
    role: 'customer',
    content: '',
    contact: '',
    contentLength: 0,
    submitting: false,
  },

  onLoad(options) {
    wx.setNavigationBarTitle({ title: '意见反馈' })
    const role = options.role === 'store' ? 'store' : 'customer'
    this.setData({ role })
  },

  onContentInput(e) {
    const content = e.detail.value || ''
    this.setData({ content, contentLength: content.length })
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value || '' })
  },

  async onSubmit() {
    if (!(this.data.content || '').trim()) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' })
      return
    }
    if (this.data.submitting) return

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中', mask: true })
    try {
      await submitFeedback(this.data.role, {
        content: this.data.content,
        contact: this.data.contact
      })
      wx.showToast({ title: '反馈已提交，感谢您的建议', icon: 'success' })
      this.setData({ content: '', contact: '', contentLength: 0 })
    } catch (e) {
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  },
})
