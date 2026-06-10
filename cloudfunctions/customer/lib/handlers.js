const cloud = require('wx-server-sdk')
const { isValidStoreId } = require('./storeId')
const { normalizeMobilePhone } = require('./phone')
const { deleteCloudFileSafe } = require('./cloudFile')
const { normalizeGender, DEFAULT_GENDER } = require('./gender')

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

function phoneConflictError(existing, action = 'create') {
  const message =
    action === 'update'
      ? '该手机号在本店已有客户档案，无法更换为该号码'
      : '该手机号在本店已有客户档案，请勿重复建档'
  const err = new Error(message)
  err.code = 'PHONE_ALREADY_EXISTS'
  err.existingId = existing._id
  return err
}

async function findByPhone(storeId, phone) {
  let p
  try {
    p = normalizeMobilePhone(phone)
  } catch (e) {
    return null
  }
  const res = await db
    .collection('customers')
    .where({ storeId, phone: p, status: _.neq('deleted') })
    .limit(1)
    .get()
  if (res.data[0]) return res.data[0]

  const asNum = Number(p)
  if (!Number.isNaN(asNum)) {
    const legacy = await db
      .collection('customers')
      .where({ storeId, phone: asNum, status: _.neq('deleted') })
      .limit(1)
      .get()
    if (legacy.data[0]) return legacy.data[0]
  }
  return null
}

/** 该手机号是否已被任意门店的已注册客户（有 wxOpenId）占用 */
async function findRegisteredByPhone(phone, excludeDocId) {
  const p = (phone || '').trim()
  if (!p) return null
  const res = await db.collection('customers').where({ phone: p }).limit(50).get()
  for (const row of res.data || []) {
    if (excludeDocId && row._id === excludeDocId) continue
    if ((row.wxOpenId || '').trim()) return row
  }
  return null
}

async function assertPhoneNotGloballyRegistered(phone, options = {}) {
  const { excludeDocId, operatorStoreId, action = 'create' } = options
  const row = await findRegisteredByPhone(phone, excludeDocId)
  if (!row) return
  const sameStore = operatorStoreId && row.storeId === operatorStoreId
  if (sameStore) {
    throw phoneConflictError(row, action)
  }
  const message =
    action === 'update'
      ? '该手机号已在其他门店登记，无法使用该手机号'
      : '该手机号已在其他门店登记，无法重复建档'
  const err = new Error(message)
  err.code = 'PHONE_REGISTERED_ELSEWHERE'
  throw err
}

function formatCustomerResponse(row, extra = {}) {
  return {
    _id: row._id,
    storeId: row.storeId,
    nickName: row.nickName || '',
    wxNickName: row.wxNickName || '',
    phone: row.phone || '',
    avatarUrl: row.avatarUrl || '',
    gender: normalizeGender(row.gender),
    address: (row.address || '').trim(),
    totalCheckins: row.totalCheckins || 0,
    ...extra
  }
}

/**
 * 门店预建档：nickName = 店长称呼；不写 wxNickName；同店同号拒绝重复建档
 */
async function createByStore(openid, payload) {
  const member = await requireStoreOperator(openid)
  const storeId = member.storeId
  const nickName = (payload.nickName || '').trim() || '新客户'
  const phone = normalizeMobilePhone(payload.phone)
  const remark = (payload.remark || '').trim()
  const gender = normalizeGender(payload.gender)
  const address = (payload.address || '').trim()
  const now = Date.now()

  const existing = await findByPhone(storeId, phone)
  if (existing) {
    throw phoneConflictError(existing)
  }

  await assertPhoneNotGloballyRegistered(phone, { operatorStoreId: storeId, action: 'create' })

  const addRes = await db.collection('customers').add({
    data: {
      storeId,
      source: 'store_create',
      nickName,
      wxNickName: '',
      phone,
      remark,
      gender,
      address,
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
  return formatCustomerResponse(created.data)
}

function mergeFollowUpDates(existing, dateStr) {
  const list = Array.isArray(existing) ? existing.filter(Boolean) : []
  const d = String(dateStr || '').trim()
  if (!d || list.includes(d)) return list
  return [...list, d]
}

/**
 * 未打卡名单 · 客户跟进：仅更新备注并记录当日跟进
 */
async function followUpByStore(customer, customerDocId, payload) {
  const followUpDate = String(payload.followUpDate || payload.date || '').trim()
  if (!followUpDate) throw new Error('缺少跟进日期')
  const remark = (payload.remark || '').trim()
  const now = Date.now()
  const followUpDates = mergeFollowUpDates(customer.followUpDates, followUpDate)
  await db.collection('customers').doc(customerDocId).update({
    data: { remark, followUpDates, updateTime: now }
  })
  const latest = await db.collection('customers').doc(customerDocId).get()
  return formatCustomerResponse(latest.data)
}

async function followUpByStoreForOperator(openid, payload) {
  const member = await requireStoreOperator(openid)
  const storeId = member.storeId
  const customerDocId = String(payload.customerDocId || payload.id || '').trim()
  if (!customerDocId) throw new Error('缺少客户 ID')

  let customer
  try {
    const docRes = await db.collection('customers').doc(customerDocId).get()
    customer = docRes.data
  } catch (e) {
    customer = null
  }
  if (!customer || customer.storeId !== storeId) {
    throw new Error('无权编辑该客户')
  }
  return followUpByStore(customer, customerDocId, payload)
}

/**
 * 门店编辑客户：手机号必填，同店同号不可占用（排除本人）
 */
async function updateByStore(openid, payload) {
  const member = await requireStoreOperator(openid)
  const storeId = member.storeId
  const customerDocId = String(payload.customerDocId || payload.id || '').trim()
  if (!customerDocId) throw new Error('缺少客户 ID')

  let customer
  try {
    const docRes = await db.collection('customers').doc(customerDocId).get()
    customer = docRes.data
  } catch (e) {
    customer = null
  }
  if (!customer || customer.storeId !== storeId) {
    throw new Error('无权编辑该客户')
  }

  if (payload.mode === 'followup') {
    return followUpByStore(customer, customerDocId, payload)
  }

  const nickName = (payload.nickName || '').trim()
  if (!nickName) throw new Error('请填写客户称呼')

  const phone = normalizeMobilePhone(payload.phone)
  const remark = (payload.remark || '').trim()
  const gender = normalizeGender(payload.gender)
  const address = (payload.address || '').trim()
  const now = Date.now()
  const storedOpenId = (customer.wxOpenId || '').trim()
  const storedPhone = (customer.phone || '').trim()

  if (storedOpenId && phone !== storedPhone) {
    throw new Error('该客户已绑定微信，手机号仅可由客户在顾客端更换')
  }

  const dup = await findByPhone(storeId, phone)
  if (dup && dup._id !== customerDocId) {
    throw phoneConflictError(dup, 'update')
  }

  if (phone !== storedPhone) {
    await assertPhoneNotGloballyRegistered(phone, {
      excludeDocId: customerDocId,
      operatorStoreId: storeId,
      action: 'update'
    })
  }

  await db.collection('customers').doc(customerDocId).update({
    data: { nickName, phone, remark, gender, address, updateTime: now }
  })

  const latest = await db.collection('customers').doc(customerDocId).get()
  return formatCustomerResponse(latest.data)
}

/**
 * 店员扫客户码打卡：已认领客户校验 openId，不以旧码覆盖手机号
 */
async function scanBindCheckin(openid, payload) {
  const member = await requireStoreOperator(openid)
  const storeId = member.storeId
  const customerDocId = (payload.customerDocId || '').trim()
  if (!customerDocId) throw new Error('无效的客户码')

  const now = Date.now()
  const today = todayDateString()
  const clientProfile = pickClientProfile(payload)

  let customer
  try {
    const docRes = await db.collection('customers').doc(customerDocId).get()
    customer = docRes.data
  } catch (e) {
    customer = null
  }
  if (!customer) {
    throw new Error('客户不存在，请确认二维码有效')
  }

  const qrPhoneRaw = (clientProfile.phone || '').trim()
  const storedPhone = (customer.phone || '').trim()
  const storedOpenId = (customer.wxOpenId || '').trim()
  const payloadOpenId = (clientProfile.wxOpenId || '').trim()

  if (!storedPhone) {
    throw new Error('客户未绑定手机号，请让顾客完成注册并授权手机号后再打卡')
  }

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

  if (storedOpenId) {
    if (!payloadOpenId || payloadOpenId !== storedOpenId) {
      const err = new Error('请让客户使用本人微信下的最新顾客码打卡')
      err.code = 'WX_OPENID_MISMATCH'
      throw err
    }
    if (qrPhoneRaw) {
      let qrPhoneNorm
      try {
        qrPhoneNorm = normalizeMobilePhone(qrPhoneRaw)
      } catch (e) {
        const err = new Error('打卡码手机号无效，请让顾客在顾客端刷新顾客码后再试')
        err.code = 'PHONE_QR_STALE'
        throw err
      }
      if (qrPhoneNorm !== storedPhone) {
        const err = new Error(
          '客户手机号已更新，与打卡码不一致，请让顾客在「我的顾客码」刷新后再出示'
        )
        err.code = 'PHONE_QR_STALE'
        throw err
      }
    }
  } else if (payloadOpenId) {
    const dupOpen = await db
      .collection('customers')
      .where({ wxOpenId: payloadOpenId })
      .limit(1)
      .get()
    if (dupOpen.data.length && dupOpen.data[0]._id !== customer._id) {
      throw new Error('该微信已绑定其他客户档案')
    }
  }

  const existingCheckinRes = await db
    .collection('checkins')
    .where({
      storeId,
      customerDocId: customer._id,
      checkinDate: today
    })
    .limit(1)
    .get()
  const existingCheckin = existingCheckinRes.data[0] || null
  const isRepeatToday = !!existingCheckin

  const updateData = {
    lastCheckinTime: now,
    lastCheckinDate: today,
    updateTime: now
  }
  if (!isRepeatToday) {
    updateData.totalCheckins = _.inc(1)
  }

  if (!existingStoreId) {
    updateData.storeId = storeId
    updateData.boundAt = now
    updateData.source = customer.source || 'self_register'
  }

  if (clientProfile.avatarUrl) {
    updateData.avatarUrl = clientProfile.avatarUrl
  }
  if (clientProfile.wxNickName) {
    updateData.wxNickName = clientProfile.wxNickName
  }

  if (!storedOpenId && payloadOpenId) {
    updateData.wxOpenId = payloadOpenId
  }

  if (!storedOpenId) {
    if (qrPhoneRaw) {
      const normalized = normalizeMobilePhone(qrPhoneRaw)
      const dup = await findByPhone(storeId, normalized)
      if (dup && dup._id !== customer._id) {
        throw phoneConflictError(dup)
      }
      updateData.phone = normalized
    } else if (!storedPhone) {
      throw new Error('打卡码缺少手机号，请让顾客注册授权后再打卡')
    }
  }

  let rollbackCheckin = null
  if (isRepeatToday) {
    rollbackCheckin = {
      type: 'update',
      docId: existingCheckin._id,
      prevCreateTime: existingCheckin.createTime,
      prevOperatorOpenId: existingCheckin.operatorOpenId
    }
    await db.collection('checkins').doc(existingCheckin._id).update({
      data: {
        createTime: now,
        operatorOpenId: openid
      }
    })
  } else {
    const checkinRes = await db.collection('checkins').add({
      data: {
        storeId,
        customerDocId: customer._id,
        checkinDate: today,
        operatorOpenId: openid,
        createTime: now
      }
    })
    rollbackCheckin = { type: 'remove', docId: checkinRes._id }
  }

  try {
    await db.collection('customers').doc(customer._id).update({ data: updateData })
  } catch (err) {
    try {
      if (rollbackCheckin.type === 'remove') {
        await db.collection('checkins').doc(rollbackCheckin.docId).remove()
      } else {
        await db.collection('checkins').doc(rollbackCheckin.docId).update({
          data: {
            createTime: rollbackCheckin.prevCreateTime,
            operatorOpenId: rollbackCheckin.prevOperatorOpenId
          }
        })
      }
    } catch (rollbackErr) {
      console.warn('[scanBindCheckin] rollback checkin failed', rollbackErr.message || rollbackErr)
    }
    throw err
  }

  const latest = await db.collection('customers').doc(customer._id).get()
  return latest.data
}

async function assertCustomerDeletable(customer, member, operatorOpenId) {
  if (!customer) {
    throw new Error('客户不存在')
  }
  if (customer.storeId !== member.storeId) {
    throw new Error('无权操作该客户')
  }
  if ((customer.wxOpenId || '').trim()) {
    const err = new Error('该客户已绑定微信，无法删除档案')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
  if ((customer.source || '').trim() !== 'store_create') {
    const err = new Error('仅支持删除代客建档且未绑定微信的客户')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
  const isOwner = member.role === 'owner'
  const createdBy = (customer.createdBy || '').trim()
  if (!isOwner && createdBy !== operatorOpenId) {
    const err = new Error('仅可删除您本人创建的预建档客户')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
  const totalCheckins = Number(customer.totalCheckins) || 0
  if (totalCheckins > 0) {
    const err = new Error('该客户已有打卡记录，无法删除')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
}

async function assertNoRelatedCustomerData(customerDocId, storeId) {
  const frame = await db
    .collection('frame_orders')
    .where({ storeId, customerId: customerDocId })
    .limit(1)
    .get()
  if (frame.data.length) {
    const err = new Error('该客户已有摆台订单，无法删除')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
  const checkins = await db
    .collection('checkins')
    .where({ storeId, customerDocId })
    .limit(1)
    .get()
  if (checkins.data.length) {
    const err = new Error('该客户已有打卡记录，无法删除')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
  const photos = await db
    .collection('photos')
    .where({ storeId, customerId: customerDocId })
    .limit(1)
    .get()
  if (photos.data.length) {
    const err = new Error('该客户已关联云相册照片，无法删除')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
  const batches = await db
    .collection('batches')
    .where({ storeId, customerId: customerDocId })
    .limit(1)
    .get()
  if (batches.data.length) {
    const err = new Error('该客户已关联云相册批次，无法删除')
    err.code = 'CUSTOMER_DELETE_FORBIDDEN'
    throw err
  }
}

function collectCustomerCloudFileIds(customer) {
  const ids = []
  const avatar = (customer.avatarUrl || '').trim()
  const qr = (customer.checkinQrFileId || '').trim()
  if (avatar.startsWith('cloud://')) ids.push(avatar)
  if (qr.startsWith('cloud://')) ids.push(qr)
  return [...new Set(ids)]
}

async function deleteCustomerCloudAssets(customer) {
  const fileIds = collectCustomerCloudFileIds(customer)
  for (const fileId of fileIds) {
    await deleteCloudFileSafe(fileId)
  }
}

/** 物理删除代客预建档客户，并清理云存储头像、打卡码等 */
async function deleteByStore(openid, payload) {
  const member = await requireStoreOperator(openid)
  const storeId = member.storeId
  const customerDocId = String(payload.customerDocId || payload.id || '').trim()
  if (!customerDocId) throw new Error('缺少客户 ID')

  let customer
  try {
    const docRes = await db.collection('customers').doc(customerDocId).get()
    customer = docRes.data
  } catch (e) {
    customer = null
  }

  await assertCustomerDeletable(customer, member, openid)
  await assertNoRelatedCustomerData(customerDocId, storeId)

  await deleteCustomerCloudAssets(customer)
  await db.collection('customers').doc(customerDocId).remove()

  return { customerDocId, deleted: true }
}

module.exports = {
  createByStore,
  updateByStore,
  followUpByStoreForOperator,
  scanBindCheckin,
  deleteByStore
}
