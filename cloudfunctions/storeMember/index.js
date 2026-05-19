const cloud = require('wx-server-sdk')
const member = require('./lib/member')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const action = event.action
  const openid = cloud.getWXContext().OPENID
  if (!openid) return { success: false, error: '未登录' }

  try {
    let data
    switch (action) {
      case 'account.resolve':
        data = await member.accountResolve(openid)
        break
      case 'store.create':
        data = await member.storeCreate(openid, event)
        break
      case 'store.get':
        data = await member.storeGet(openid)
        break
      case 'store.update':
        data = await member.storeUpdate(openid, event)
        break
      case 'invite.create':
        data = await member.inviteCreate(openid, event)
        break
      case 'invite.revoke':
        data = await member.inviteRevoke(openid, event)
        break
      case 'invite.preview':
        data = await member.invitePreview(event)
        break
      case 'invite.accept':
        data = await member.inviteAccept(openid, event)
        break
      case 'member.list':
        data = await member.memberList(openid, event)
        break
      case 'member.approve':
        data = await member.memberApprove(openid, event)
        break
      case 'member.reject':
        data = await member.memberReject(openid, event)
        break
      case 'member.disable':
        data = await member.memberDisable(openid, event)
        break
      case 'platform.settings':
        data = await member.platformSettingsGet(openid)
        break
      case 'customerRegisterInvite.create':
        data = await member.customerRegisterInviteCreate(openid, event)
        break
      case 'batch.linkCustomer':
        data = await member.batchLinkCustomer(openid, event)
        break
      default:
        return { success: false, error: `未知 action: ${action}` }
    }
    return { success: true, data }
  } catch (err) {
    console.error('[storeMember]', action, err)
    return { success: false, error: err.message || '操作失败' }
  }
}
