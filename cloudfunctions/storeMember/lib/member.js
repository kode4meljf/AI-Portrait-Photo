const cloud = require('wx-server-sdk')
const { isValidStoreId, generateStoreId, generateInviteToken } = require('./storeId')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const platform = require('./platform')

const MEMBERS = 'store_members'
const INVITES = 'store_invites'
const STORES = 'stores'

async function getActiveMember(openid) {
  const res = await db
    .collection(MEMBERS)
    .where({ memberOpenId: openid, status: 'active' })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function getAnyMember(openid) {
  const res = await db.collection(MEMBERS).where({ memberOpenId: openid }).limit(20).get()
  if (!res.data.length) return null
  return res.data.sort((a, b) => (b.updateTime || 0) - (a.updateTime || 0))[0]
}

async function requireActiveMember(openid) {
  const member = await getActiveMember(openid)
  if (!member) throw new Error('您不是门店成员或账号未激活')
  if (!isValidStoreId(member.storeId)) throw new Error('门店ID无效，请联系管理员')
  return member
}

async function requireOwner(openid, storeId) {
  const member = await requireActiveMember(openid)
  if (member.storeId !== storeId) throw new Error('无权操作该门店')
  if (member.role !== 'owner') throw new Error('仅店长可执行此操作')
  return member
}

async function getStoreName(storeId) {
  try {
    const res = await db.collection(STORES).doc(storeId).get()
    return (res.data && res.data.name) || storeId
  } catch (e) {
    return storeId
  }
}

async function getCustomerByOpenId(openid) {
  const res = await db.collection('customers').where({ wxOpenId: openid }).limit(1).get()
  return res.data[0] || null
}

async function accountResolve(openid) {
  const member = await getAnyMember(openid)
  if (member) {
    const storeName = await getStoreName(member.storeId)
    return {
      accountKind: 'store',
      hasMembership: true,
      canUseStore: member.status === 'active' && isValidStoreId(member.storeId),
      storeId: member.storeId,
      role: member.role,
      status: member.status,
      storeName,
      memberId: member._id
    }
  }

  const customer = await getCustomerByOpenId(openid)
  if (customer && isValidStoreId(customer.storeId) && (customer.phone || '').trim()) {
    const storeName = await getStoreName(customer.storeId)
    return {
      accountKind: 'customer',
      hasMembership: true,
      canUseStore: false,
      storeId: customer.storeId,
      storeName,
      customerDocId: customer._id,
      customerId: customer.customerId,
      customer: {
        _id: customer._id,
        customerId: customer.customerId,
        nickName: customer.nickName || '',
        wxNickName: customer.wxNickName || '',
        phone: customer.phone || '',
        avatarUrl: customer.avatarUrl || ''
      }
    }
  }

  return {
    accountKind: 'none',
    hasMembership: false,
    canUseStore: false,
    storeId: null,
    role: null,
    status: null
  }
}

const CUSTOMER_REGISTER_INVITES = 'customer_register_invites'

async function customerRegisterInviteCreate(openid, payload) {
  const member = await requireActiveMember(openid)
  const storeId = member.storeId
  const token = generateInviteToken()
  const now = Date.now()
  const expireHours = Number(payload.expireHours) || 168
  const expireAt = now + expireHours * 3600 * 1000

  await db.collection(CUSTOMER_REGISTER_INVITES).add({
    data: {
      token,
      storeId,
      createdBy: openid,
      status: 'active',
      expireAt,
      createTime: now
    }
  })

  return { token, storeId, expireAt }
}

async function storeCreate(openid, payload) {
  const existing = await getAnyMember(openid)
  if (existing && existing.status === 'active') {
    throw new Error('您已加入门店，无法重复创建')
  }

  const customerDup = await db
    .collection('customers')
    .where({ wxOpenId: openid })
    .limit(1)
    .get()
  if (customerDup.data.length) {
    throw new Error('该微信已注册为客户，无法创建门店')
  }

  const storeId = generateStoreId()
  const now = Date.now()
  const name = (payload.name || 'AI写真馆').trim()

  // stores 主档：业务 ID 仅存在文档 _id（store_xxx），不在正文重复 storeId 字段
  const storeData = {
    accountType: 'store',
    name,
    contactName: (payload.contactName || '').trim(),
    contactPhone: (payload.contactPhone || '').trim(),
    address: (payload.address || '').trim(),
    avatarUrl: '',
    level: '普通会员',
    balance: 100,
    packageTotal: 0,
    packageUsed: 0,
    packageExpireDate: null,
    ownerOpenId: openid,
    createTime: now,
    updateTime: now
  }

  await db.collection(STORES).doc(storeId).set({ data: storeData })

  if (existing) {
    await db.collection(MEMBERS).doc(existing._id).update({
      data: {
        storeId,
        role: 'owner',
        status: 'active',
        updateTime: now,
        approvedAt: now
      }
    })
  } else {
    await db.collection(MEMBERS).add({
      data: {
        storeId,
        memberOpenId: openid,
        role: 'owner',
        status: 'active',
        nickName: (payload.contactName || '').trim(),
        createTime: now,
        updateTime: now,
        approvedAt: now
      }
    })
  }

  return { _id: storeId, name }
}

const STORE_PROFILE_FIELDS = [
  'name',
  'contactName',
  'contactPhone',
  'address',
  'mapAddress',
  'addressName',
  'addressDetail',
  'distanceText',
  'houseNumber',
  'avatarUrl',
  'latitude',
  'longitude',
  'packageTotal',
  'packageUsed',
  'packageExpireDate'
]

async function storeGet(openid) {
  const member = await requireActiveMember(openid)
  const res = await db.collection(STORES).doc(member.storeId).get()
  if (!res.data) throw new Error('门店档案不存在')
  return { ...res.data, _id: member.storeId }
}

async function storeUpdate(openid, payload) {
  const member = await requireActiveMember(openid)
  const storeId = member.storeId
  if (payload.storeId && payload.storeId !== storeId) {
    throw new Error('无权操作该门店')
  }

  const data = {}
  STORE_PROFILE_FIELDS.forEach((key) => {
    if (payload[key] !== undefined) data[key] = payload[key]
  })
  if (payload.balanceInc !== undefined) {
    data.balance = _.inc(Number(payload.balanceInc) || 0)
  }
  if (!Object.keys(data).length) throw new Error('没有可更新字段')

  data.updateTime = Date.now()
  await db.collection(STORES).doc(storeId).update({ data })
  return storeGet(openid)
}

async function inviteCreate(openid, payload) {
  const storeId = payload.storeId
  if (!isValidStoreId(storeId)) throw new Error('门店ID无效')
  await requireOwner(openid, storeId)

  const token = generateInviteToken()
  const now = Date.now()
  const expireHours = Number(payload.expireHours) || 24
  const expireAt = now + expireHours * 3600 * 1000

  await db.collection(INVITES).add({
    data: {
      token,
      storeId,
      createdBy: openid,
      status: 'active',
      expireAt,
      createTime: now
    }
  })

  return { token, storeId, expireAt }
}

async function inviteRevoke(openid, payload) {
  const storeId = payload.storeId
  await requireOwner(openid, storeId)
  const token = (payload.token || '').trim()
  if (!token) throw new Error('缺少 token')

  const res = await db
    .collection(INVITES)
    .where({ token, storeId, status: 'active' })
    .limit(1)
    .get()
  if (!res.data.length) throw new Error('邀请不存在或已失效')
  await db.collection(INVITES).doc(res.data[0]._id).update({
    data: { status: 'revoked', updateTime: Date.now() }
  })
  return { revoked: true }
}

async function invitePreview(payload) {
  const token = (payload.token || '').trim()
  if (!token) throw new Error('缺少邀请码')
  const res = await db
    .collection(INVITES)
    .where({ token, status: 'active' })
    .limit(1)
    .get()
  if (!res.data.length) throw new Error('邀请码无效')
  const invite = res.data[0]
  if (invite.expireAt && invite.expireAt < Date.now()) {
    throw new Error('邀请码已过期')
  }
  const storeName = await getStoreName(invite.storeId)
  return { storeId: invite.storeId, storeName, expireAt: invite.expireAt }
}

async function inviteAccept(openid, payload) {
  const token = (payload.token || '').trim()
  if (!token) throw new Error('缺少邀请码')

  const activeElsewhere = await getActiveMember(openid)
  if (activeElsewhere) {
    throw new Error('您已加入其他门店，请先联系店长处理')
  }

  const cust = await db.collection('customers').where({ wxOpenId: openid }).limit(1).get()
  if (cust.data.length) {
    throw new Error('该微信已注册为客户，无法加入门店')
  }

  const invRes = await db
    .collection(INVITES)
    .where({ token, status: 'active' })
    .limit(1)
    .get()
  if (!invRes.data.length) throw new Error('邀请码无效')
  const invite = invRes.data[0]
  if (invite.expireAt && invite.expireAt < Date.now()) {
    throw new Error('邀请码已过期')
  }
  if (!isValidStoreId(invite.storeId)) throw new Error('门店数据异常')

  const now = Date.now()
  const pending = await db
    .collection(MEMBERS)
    .where({ memberOpenId: openid, storeId: invite.storeId })
    .limit(1)
    .get()

  if (pending.data.length) {
    const row = pending.data[0]
    if (row.status === 'active') throw new Error('您已是本店成员')
    if (row.status === 'pending') throw new Error('已提交申请，请等待店长审核')
    await db.collection(MEMBERS).doc(row._id).update({
      data: { status: 'pending', updateTime: now, role: 'staff' }
    })
    return { storeId: invite.storeId, status: 'pending' }
  }

  await db.collection(MEMBERS).add({
    data: {
      storeId: invite.storeId,
      memberOpenId: openid,
      role: 'staff',
      status: 'pending',
      nickName: (payload.nickName || '').trim(),
      createTime: now,
      updateTime: now
    }
  })

  return { storeId: invite.storeId, status: 'pending' }
}

async function memberList(openid, payload) {
  const storeId = payload.storeId
  if (!isValidStoreId(storeId)) throw new Error('门店ID无效')
  await requireActiveMember(openid)
  const caller = await requireActiveMember(openid)
  if (caller.storeId !== storeId) throw new Error('无权查看该门店成员')

  const status = payload.status
  const where = status ? { storeId, status } : { storeId }
  const res = await db.collection(MEMBERS).where(where).orderBy('createTime', 'desc').limit(100).get()
  return { list: res.data }
}

async function memberApprove(openid, payload) {
  const storeId = payload.storeId
  const memberId = payload.memberId
  await requireOwner(openid, storeId)
  if (!memberId) throw new Error('缺少 memberId')

  const doc = await db.collection(MEMBERS).doc(memberId).get()
  const row = doc.data
  if (!row || row.storeId !== storeId) throw new Error('成员不存在')
  if (row.status !== 'pending') throw new Error('仅可审核待通过成员')

  const now = Date.now()
  await db.collection(MEMBERS).doc(memberId).update({
    data: { status: 'active', updateTime: now, approvedAt: now }
  })
  return { memberId, status: 'active' }
}

async function memberReject(openid, payload) {
  const storeId = payload.storeId
  const memberId = payload.memberId
  await requireOwner(openid, storeId)
  if (!memberId) throw new Error('缺少 memberId')

  const doc = await db.collection(MEMBERS).doc(memberId).get()
  const row = doc.data
  if (!row || row.storeId !== storeId) throw new Error('成员不存在')
  if (row.status !== 'pending') throw new Error('仅可拒绝待审核成员')

  await db.collection(MEMBERS).doc(memberId).update({
    data: { status: 'disabled', updateTime: Date.now(), rejectReason: payload.reason || '' }
  })
  return { memberId, status: 'disabled' }
}

async function memberDisable(openid, payload) {
  const storeId = payload.storeId
  const memberId = payload.memberId
  await requireOwner(openid, storeId)
  if (!memberId) throw new Error('缺少 memberId')

  const doc = await db.collection(MEMBERS).doc(memberId).get()
  const row = doc.data
  if (!row || row.storeId !== storeId) throw new Error('成员不存在')
  if (row.role === 'owner') {
    const owners = await db
      .collection(MEMBERS)
      .where({ storeId, role: 'owner', status: 'active' })
      .count()
    if (owners.total <= 1) throw new Error('至少保留一名店长')
  }

  await db.collection(MEMBERS).doc(memberId).update({
    data: { status: 'disabled', updateTime: Date.now() }
  })
  return { memberId, status: 'disabled' }
}

/** 门店端读取平台配置（如客服电话） */
async function platformSettingsGet(openid) {
  await requireActiveMember(openid)
  return platform.getSettingsForStore()
}

/** 云相册：将批次及下属照片关联到客户（服务端写入，避免客户端无写权限） */
async function batchLinkCustomer(openid, payload) {
  const member = await requireActiveMember(openid)
  const storeId = member.storeId
  const batchId = String(payload.batchId || '').trim()
  const customerDocId = String(payload.customerId || payload.customerDocId || '').trim()
  if (!batchId) throw new Error('缺少批次 ID')
  if (!customerDocId) throw new Error('请选择客户')

  let batch
  try {
    const batchRes = await db.collection('batches').doc(batchId).get()
    batch = batchRes.data
  } catch (e) {
    throw new Error('批次不存在')
  }
  if (!batch || batch.storeId !== storeId) throw new Error('无权操作该批次')

  let customer
  try {
    const custRes = await db.collection('customers').doc(customerDocId).get()
    customer = custRes.data
  } catch (e) {
    throw new Error('客户不存在')
  }
  if (!customer || customer.storeId !== storeId) throw new Error('客户不属于当前门店')

  const now = Date.now()
  await db.collection('batches').doc(batchId).update({
    data: { customerId: customerDocId, updateTime: now }
  })

  const photosRes = await db.collection('photos').where({ batchId }).get()
  const photos = photosRes.data || []
  const chunkSize = 20
  for (let i = 0; i < photos.length; i += chunkSize) {
    const chunk = photos.slice(i, i + chunkSize)
    await Promise.all(
      chunk.map((p) =>
        db.collection('photos').doc(p._id).update({ data: { customerId: customerDocId } })
      )
    )
  }

  const alias = (customer.nickName || '').trim()
  const wxNick = (customer.wxNickName || '').trim()
  return {
    batchId,
    customerId: customerDocId,
    customerName: alias || wxNick || '匿名用户'
  }
}

module.exports = {
  accountResolve,
  storeCreate,
  storeGet,
  storeUpdate,
  inviteCreate,
  inviteRevoke,
  invitePreview,
  inviteAccept,
  memberList,
  memberApprove,
  memberReject,
  memberDisable,
  requireActiveMember,
  getStoreName,
  platformSettingsGet,
  customerRegisterInviteCreate,
  batchLinkCustomer
}
