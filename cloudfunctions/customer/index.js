const cloud = require('wx-server-sdk')
const handlers = require('./lib/handlers')
const register = require('./lib/register')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const action = event.action
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    let data
    switch (action) {
      case 'register.preview':
        data = await register.registerPreview(event)
        break
      case 'register.complete':
        if (!openid) return { success: false, error: '未登录' }
        data = await register.registerComplete(openid, event)
        break
      case 'profile.get':
        if (!openid) return { success: false, error: '未登录' }
        data = await register.getMyProfile(openid)
        break
      case 'profile.update':
        if (!openid) return { success: false, error: '未登录' }
        data = await register.updateMyProfile(openid, event)
        break
      case 'profile.syncWx':
        if (!openid) return { success: false, error: '未登录' }
        data = await register.syncWxProfile(openid, event)
        break
      case 'orders.list':
        if (!openid) return { success: false, error: '未登录' }
        data = await register.listMyOrders(openid)
        break
      case 'orders.get':
        if (!openid) return { success: false, error: '未登录' }
        data = await register.getMyOrder(openid, event)
        break
      case 'createByStore':
        if (!openid) return { success: false, error: '未登录' }
        data = await handlers.createByStore(openid, event)
        break
      case 'scan.bindCheckin':
        if (!openid) return { success: false, error: '未登录' }
        data = await handlers.scanBindCheckin(openid, event)
        break
      default:
        return { success: false, error: `未知 action: ${action}` }
    }
    return { success: true, data }
  } catch (err) {
    console.error('[customer]', action, err)
    return {
      success: false,
      error: err.message || '操作失败',
      code: err.code || 'ERROR',
      storeName: err.storeName
    }
  }
}
