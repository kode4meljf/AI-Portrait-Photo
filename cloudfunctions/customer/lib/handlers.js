const cloud = require('wx-server-sdk')
const { isValidStoreId, generateCustomerId } = require('./storeId')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

async function requireStoreOperator(openid) {
  const res = await db
    .collection('store_members')
    .where({ memberOpenId: openid, status: 'active' })
    .limit(1)
    .get()
  if (!res.data.length) throw new Error('您不是门店成员或账号未激活')
  const member = res.data[0]
  if (!isValidStoreId(member.storeId)) throw new Error('门店ID无效')
  return member
}

async function getStoreName(storeId) {
  try {
    const res = await db.collection('stores').doc(storeId).get()
    return (res.data && res.data.name) || storeId
  } catch (e) {
    return storeId
  }
}

function todayDateString() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const { buildCheckinQrPayload } = require('./qrPayload')

function pickClientProfile(payload) {
  const wxNickName = (payload.wxNickName || payload.wechatNickName || '').trim()
  const avatarUrl = (payload.avatarUrl || '').trim()
  const wxOpenId = (payload.wxOpenId || payload.openId || '').trim()
  const phone = (payload.phone || '').trim()
  const out = {}
  if (wxNickName) out.wxNickName = wxNickName
  if (avatarUrl) out.avatarUrl = avatarUrl
  if (wxOpenId) out.wxOpenId = wxOpenId
  if (phone) out.phone = phone
  return out
}

async function findByPhone(storeId, phone) {
  const p = (phone || '').trim()
  if (!p) return null
  const res = await db.collection('customers').where({ storeId, phone: p }).limit(1).get()
  return res.data[0] || null
}

function formatCustomerResponse(row, extra = {}) {
  return {
    _id: row._id,
    customerId: row.customerId,
    storeId: row.storeId,
    nickName: row.nickName || '',
    wxNickName: row.wxNickName || '',
    phone: row.phone || '',
    avatarUrl: row.avatarUrl || '',
    totalCheckins: row.totalCheckins || 0,
    qrPayload: buildCheckinQrPayload(row),
    ...extra
  }
}

/**
 * 门店预建档：nickName = 店长称呼；不写 wxNickName
 * 同门店同手机号合并到已有档案
 */
async function createByStore(openid, payload) {
  const member = await requireStoreOperator(openid)
  const storeId = member.storeId
  const nickName = (payload.nickName || '').trim() || '新客户'
  const phone = (payload.phone || '').trim()
  const remark = (payload.remark || '').trim()
  const now = Date.now()

  if (phone) {
    const existing = await findByPhone(storeId, phone)
    if (existing) {
      const patch = { updateTime: now }
      if (nickName && nickName !== '新客户') patch.nickName = nickName
      if (remark) patch.remark = remark
      if (Object.keys(patch).length > 1) {
        await db.collection('customers').doc(existing._id).update({ data: patch })
      }
      const latest = await db.collection('customers').doc(existing._id).get()
      return formatCustomerResponse(latest.data, { merged: true })
    }
  }

  const customerId = generateCustomerId()
  const addRes = await db.collection('customers').add({
    data: {
      customerId,
      storeId,
      source: 'store_create',
      nickName,
      wxNickName: '',
      phone,
      remark,
      avatarUrl: '',
      wxOpenId: '',
      equityAlbum: Number(payload.equityAlbum) || 0,
      equityFrame: Number(payload.equityFrame) || 0,
      totalCheckins: 0,
      createdBy: openid,
      createTime: now,
      updateTime: now
    }
  })

  const created = await db.collection('customers').doc(addRes._id).get()
  return formatCustomerResponse(created.data, { merged: false })
}

/**
 * 店员扫客户码打卡：以码上客户资料为准更新头像/微信昵称
 */
async function scanBindCheckin(openid, payload) {
  const member = await requireStoreOperator(openid)
  const storeId = member.storeId
  const customerId = (payload.customerId || '').trim()
  if (!customerId) throw new Error('无效的客户码')

  const now = Date.now()
  const today = todayDateString()
  const clientProfile = pickClientProfile(payload)

  const found = await db.collection('customers').where({ customerId }).limit(1).get()
  if (!found.data.length) {
    throw new Error('客户不存在，请确认二维码有效')
  }

  const customer = found.data[0]
  const existingStoreId = customer.storeId || ''

  if (existingStoreId && existingStoreId !== storeId) {
    if (!isValidStoreId(existingStoreId)) {
      throw new Error('客户归属数据异常，请联系平台')
    }
    const otherName = await getStoreName(existingStoreId)
    const err = new Error(`该客户已由「${otherName}」管理`)
    err.code = 'CUSTOMER_BOUND_OTHER_STORE'
    err.storeName = otherName
    throw err
  }

  const updateData = {
    totalCheckins: _.inc(1),
    lastCheckinTime: now,
    lastCheckinDate: today,
    updateTime: now
  }

  if (!existingStoreId) {
    updateData.storeId = storeId
    updateData.boundAt = now
    updateData.source = customer.source || 'self_register'
  }

  if (clientProfile.avatarUrl) {
    updateData.avatarUrl = clientProfile.avatarUrl
  }
  // 每次打卡：扫码 payload 中的微信昵称写入库（与注册时写入字段一致）
  if (clientProfile.wxNickName) {
    updateData.wxNickName = clientProfile.wxNickName
  }
  if (clientProfile.wxOpenId) {
    updateData.wxOpenId = clientProfile.wxOpenId
  }
  if (clientProfile.phone && !customer.phone) {
    updateData.phone = clientProfile.phone
  }

  await db.collection('customers').doc(customer._id).update({ data: updateData })

  await db.collection('checkins').add({
    data: {
      storeId,
      customerId,
      customerDocId: customer._id,
      checkinDate: today,
      operatorOpenId: openid,
      createTime: now
    }
  })

  const latest = await db.collection('customers').doc(customer._id).get()
  return latest.data
}

module.exports = {
  createByStore,
  scanBindCheckin
}
