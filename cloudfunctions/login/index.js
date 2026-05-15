// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    console.error(
      'login: OPENID 为空，多为云环境未与当前小程序绑定、login 未部署到 DYNAMIC_CURRENT_ENV，或工具未正确拉取用户身份'
    )
  }
  return {
    openid: openid || '',
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}