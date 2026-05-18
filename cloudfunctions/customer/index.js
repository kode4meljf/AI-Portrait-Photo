const cloud = require('wx-server-sdk')
const handlers = require('./lib/handlers')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const action = event.action
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, error: '未登录' }

  try {
    let data
    switch (action) {
      case 'createByStore':
        data = await handlers.createByStore(openid, event)
        break
      case 'scan.bindCheckin':
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
