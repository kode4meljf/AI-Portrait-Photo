const cloud = require('wx-server-sdk')
const handlers = require('./lib/handlers')
const register = require('./lib/register')
const platform = require('./lib/platform')
const feedback = require('./lib/feedback')
const { checkinQrImage } = require('./lib/checkinQr')

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
      case 'profile.checkinQrImage':
        if (!openid) return { success: false, error: '未登录' }
        {
          const row = await register.getCustomerByOpenId(openid)
          if (!row || !row.storeId) throw new Error('您尚未注册为顾客')
          data = await checkinQrImage(row, { openId: openid })
        }
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
      case 'updateByStore':
        if (!openid) return { success: false, error: '未登录' }
        data = await handlers.updateByStore(openid, event)
        break
      case 'deleteByStore':
        if (!openid) return { success: false, error: '未登录' }
        data = await handlers.deleteByStore(openid, event)
        break
      case 'scan.bindCheckin':
        if (!openid) return { success: false, error: '未登录' }
        data = await handlers.scanBindCheckin(openid, event)
        break
      case 'platform.settings':
        data = await platform.getSettings()
        break
      case 'feedback.submit':
        if (!openid) return { success: false, error: '未登录' }
        data = await feedback.submitCustomerFeedback(openid, event)
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
      storeName: err.storeName,
      existingId: err.existingId || ''
    }
  }
}
