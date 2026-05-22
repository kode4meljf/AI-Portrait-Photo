const cloud = require('wx-server-sdk')
const { isValidStoreId } = require('./storeId')
const { getPhoneFromCode } = require('./phone')
const { buildCheckinQrPayload } = require('./qrPayload')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const INVITES = 'customer_register_invites'

async function getStoreDoc(storeId) {
  try {
    const res = await db.collection('stores').doc(storeId).get()
    return res.data || null
  } catch (e) {
    return null
  }
}

async function getStoreName(storeId) {
  const store = await getStoreDoc(storeId)
  return (store && store.name) || storeId
}

function maskPhone(phone) {
  const p = String(phone || '')
    .trim()
    .replace(/\s/g, '')
  if (!p) return ''
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(-4)}`
  if (p.length >= 7) return `${p.slice(0, 2)}****${p.slice(-2)}`
  return '****'
}

/** 联系人脱敏：单字保留；两字「张*」；三字及以上首尾保留 */
function maskContactName(name) {
  const n = (name || '').trim()
  if (!n) return ''
  if (n.length === 1) return n
  if (n.length === 2) return `${n[0]}*`
  return `${n[0]}${'*'.repeat(n.length - 2)}${n[n.length - 1]}`
}

function formatStoreAddress(store) {
  if (!store) return ''
  const parts = [(store.addressName || '').trim(), (store.addressDetail || '').trim()]
  const joined = parts.filter(Boolean).join(' ')
  if (joined) return joined
  return ((store.mapAddress || store.address) || '').trim()
}

function buildStoreRegisterPreview(store, storeId) {
  const storeName = ((store && store.name) || '').trim() || storeId
  const contactRaw = (store && store.contactName) || ''
  const phoneMask = maskPhone(store && store.contactPhone)
  let contactDisplay = maskContactName(contactRaw)
  if (!contactDisplay && phoneMask) contactDisplay = phoneMask
  else if (contactDisplay && phoneMask) contactDisplay = `${contactDisplay} · ${phoneMask}`
  const address = formatStoreAddress(store)

  return {
    storeName,
    contactName: contactDisplay || '暂未填写',
    address: address || '暂未填写'
  }
}

async function getActiveStoreMember(openid) {
  const res = await db
    .collection('store_members')
    .where({ memberOpenId: openid, status: 'active' })
    .limit(1)
    .get()
  return res.data[0] || null
}

async function getCustomerByOpenId(openid) {
  const res = await db.collection('customers').where({ wxOpenId: openid }).limit(1).get()
  return res.data[0] || null
}

function formatCustomer(row) {
  return {
    _id: row._id,
    storeId: row.storeId,
    nickName: row.nickName || '',
    wxNickName: row.wxNickName || '',
    phone: row.phone || '',
    avatarUrl: row.avatarUrl || '',
    totalCheckins: row.totalCheckins || 0,
    equityAlbum: row.equityAlbum != null ? row.equityAlbum : 0,
    equityFrame: row.equityFrame != null ? row.equityFrame : 0,
    qrPayload: buildCheckinQrPayload(row)
  }
}

async function loadInvite(token) {
  const t = (token || '').trim()
  if (!t) throw new Error('缺少注册邀请码')
  const res = await db.collection(INVITES).where({ token: t, status: 'active' }).limit(1).get()
  if (!res.data.length) throw new Error('注册链接无效或已失效')
  const invite = res.data[0]
  if (invite.expireAt && invite.expireAt < Date.now()) {
    throw new Error('注册链接已过期，请联系门店重新获取')
  }
  if (!isValidStoreId(invite.storeId)) throw new Error('门店数据异常')
  return invite
}

/** 注册页预览门店（无需登录；联系人/电话脱敏） */
async function registerPreview(payload) {
  const invite = await loadInvite(payload.token)
  const store = await getStoreDoc(invite.storeId)
  const preview = buildStoreRegisterPreview(store, invite.storeId)
  return {
    storeId: invite.storeId,
    storeName: preview.storeName,
    contactName: preview.contactName,
    address: preview.address,
    expireAt: invite.expireAt || null
  }
}

/** 完成注册：必授权手机号，绑定邀请门店 */
async function registerComplete(openid, payload) {
  if (!openid) throw new Error('未登录')

  const member = await getActiveStoreMember(openid)
  if (member) {
    throw new Error('您已是门店成员，请使用门店端登录')
  }

  const invite = await loadInvite(payload.token)
  const targetStoreId = invite.storeId
  const phone = await getPhoneFromCode(payload.phoneCode)
  const wxNickName = (payload.wxNickName || '').trim()
  const avatarUrl = (payload.avatarUrl || '').trim()
  const now = Date.now()

  const existing = await getCustomerByOpenId(openid)
  if (existing) {
    const boundStore = existing.storeId || ''
    if (boundStore && boundStore !== targetStoreId) {
      const otherName = await getStoreName(boundStore)
      const err = new Error(`您已绑定「${otherName}」，无法注册到其他门店`)
      err.code = 'CUSTOMER_BOUND_OTHER_STORE'
      err.storeName = otherName
      throw err
    }

    const patch = {
      phone,
      updateTime: now,
      boundAt: existing.boundAt || now
    }
    if (wxNickName) patch.wxNickName = wxNickName
    if (avatarUrl) patch.avatarUrl = avatarUrl
    if (!boundStore) {
      patch.storeId = targetStoreId
      patch.source = existing.source || 'link_register'
    }

    await db.collection('customers').doc(existing._id).update({ data: patch })
    const latest = await db.collection('customers').doc(existing._id).get()
    return formatCustomer(latest.data)
  }

  const dupPhone = await db
    .collection('customers')
    .where({ storeId: targetStoreId, phone })
    .limit(1)
    .get()
  if (dupPhone.data.length) {
    const row = dupPhone.data[0]
    if (row.wxOpenId && row.wxOpenId !== openid) {
      throw new Error('该手机号已被其他客户使用')
    }
    const patch = {
      wxOpenId: openid,
      updateTime: now,
      boundAt: row.boundAt || now
    }
    if (wxNickName) patch.wxNickName = wxNickName
    if (avatarUrl) patch.avatarUrl = avatarUrl
    await db.collection('customers').doc(row._id).update({ data: patch })
    const latest = await db.collection('customers').doc(row._id).get()
    return formatCustomer(latest.data)
  }

  const addRes = await db.collection('customers').add({
    data: {
      storeId: targetStoreId,
      source: 'link_register',
      nickName: '',
      wxNickName,
      phone,
      avatarUrl,
      wxOpenId: openid,
      remark: '',
      equityAlbum: 0,
      equityFrame: 0,
      totalCheckins: 0,
      boundAt: now,
      createTime: now,
      updateTime: now
    }
  })

  const created = await db.collection('customers').doc(addRes._id).get()
  return formatCustomer(created.data)
}

async function getMyProfile(openid) {
  const row = await getCustomerByOpenId(openid)
  if (!row || !row.storeId) throw new Error('您尚未注册为顾客')
  if (!(row.phone || '').trim()) throw new Error('请完成手机号授权')
  const storeName = await getStoreName(row.storeId)
  return { ...formatCustomer(row), storeName }
}

/** 顾客端：仅同步微信昵称/头像（注册、到店打卡前；不可改 nickName） */
async function syncWxProfile(openid, payload) {
  const row = await getCustomerByOpenId(openid)
  if (!row) throw new Error('您尚未注册为顾客')

  const data = { updateTime: Date.now() }
  const wxNickName = (payload.wxNickName || '').trim()
  const avatarUrl = (payload.avatarUrl || '').trim()
  if (wxNickName) data.wxNickName = wxNickName
  if (avatarUrl) data.avatarUrl = avatarUrl
  if (Object.keys(data).length <= 1) throw new Error('请提供微信昵称或头像')

  await db.collection('customers').doc(row._id).update({ data })
  return getMyProfile(openid)
}

async function updateMyProfile(openid, payload) {
  const row = await getCustomerByOpenId(openid)
  if (!row) throw new Error('您尚未注册为顾客')

  const data = { updateTime: Date.now() }
  if (payload.avatarUrl !== undefined) data.avatarUrl = (payload.avatarUrl || '').trim()

  if (payload.phoneCode) {
    const phone = await getPhoneFromCode(payload.phoneCode)
    if (phone !== (row.phone || '').trim()) {
      const dup = await db
        .collection('customers')
        .where({ storeId: row.storeId, phone })
        .limit(1)
        .get()
      if (dup.data.length && dup.data[0]._id !== row._id) {
        throw new Error('该手机号已被其他客户使用')
      }
    }
    data.phone = phone
  }

  if (Object.keys(data).length <= 1) throw new Error('没有可更新内容')
  await db.collection('customers').doc(row._id).update({ data })
  return getMyProfile(openid)
}

async function listMyOrders(openid) {
  const row = await getCustomerByOpenId(openid)
  if (!row) throw new Error('您尚未注册为顾客')
  const res = await db
    .collection('frame_orders')
    .where({ customerId: row._id })
    .orderBy('createTime', 'desc')
    .limit(50)
    .get()
  return { list: res.data }
}

async function getMyOrder(openid, payload) {
  const row = await getCustomerByOpenId(openid)
  if (!row) throw new Error('您尚未注册为顾客')
  const orderId = payload.orderId
  if (!orderId) throw new Error('缺少 orderId')
  const res = await db.collection('frame_orders').doc(orderId).get()
  const order = res.data
  if (!order || order.customerId !== row._id) {
    throw new Error('订单不存在或无权查看')
  }
  return { order }
}

module.exports = {
  registerPreview,
  registerComplete,
  getMyProfile,
  syncWxProfile,
  updateMyProfile,
  listMyOrders,
  getMyOrder,
  getCustomerByOpenId,
  formatCustomer,
  getStoreName
}
