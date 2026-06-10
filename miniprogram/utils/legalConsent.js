/** 注册/加入等场景：收集个人信息前须勾选协议 */

function requireLegalAgreed(agreed) {
  if (agreed) return true
  wx.showToast({ title: '请先阅读并同意用户协议与隐私政策', icon: 'none' })
  return false
}

module.exports = { requireLegalAgreed }
