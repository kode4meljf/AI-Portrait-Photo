const cloud = require('wx-server-sdk')
const { isValidStoreId, generateStoreId, generateInviteToken } = require('./storeId')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const platform = require('./platform')
const { getPhoneFromCode } = require('./phone')
const QRCode = require('qrcode')

const MEMBERS = 'store_members'
const INVITES = 'store_invites'
const STORES = 'stores'
/** 手机号 code 一次性：授权时落库，提交时用 phoneAuthId 取用 */
const PHONE_AUTH = 'member_phone_auth'

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

/** 手机号脱敏，供邀请预览等场景 */
function maskPhone(phone) {
  const p = String(phone || '')
    .trim()
    .replace(/\s/g, '')
  if (!p) return ''
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(-4)}`
  if (p.length >= 7) return `${p.slice(0, 2)}****${p.slice(-2)}`
  return '****'
}

function briefAddress(store) {
  const addr = ((store && (store.mapAddress || store.address)) || '').trim()
  if (!addr) return ''
  return addr.length > 48 ? `${addr.slice(0, 48)}…` : addr
}

/** 门店名称规范化：去首尾空白、合并连续空格 */
function normalizeStoreName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** 查重键：仅忽略大小写（不考虑全角半角） */
function storeNameKey(name) {
  return normalizeStoreName(name).toLowerCase()
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function backfillStoreNameKey(storeId, store) {
  if (!storeId || !store || store.nameKey) return
  const nameKey = storeNameKey(store.name)
  if (!nameKey) return
  try {
    await db.collection(STORES).doc(storeId).update({
      data: { nameKey, updateTime: Date.now() }
    })
  } catch (e) {
    console.warn('[store] backfill nameKey failed', storeId, e.message || e)
  }
}

/** 禁止同名门店（创建 / 改名）；excludeStoreId 为当前门店自身时跳过 */
async function assertStoreNameAvailable(name, excludeStoreId) {
  const norm = normalizeStoreName(name)
  if (!norm) throw new Error('请填写门店名称')
  const nameKey = storeNameKey(norm)

  const byKey = await db.collection(STORES).where({ nameKey }).limit(10).get()
  let dup = (byKey.data || []).find((row) => row._id !== excludeStoreId)

  if (!dup) {
    const legacy = await db
      .collection(STORES)
      .where({
        name: db.RegExp({
          regexp: `^${escapeRegExp(norm)}$`,
          options: 'i'
        })
      })
      .limit(20)
      .get()
    for (const row of legacy.data || []) {
      if (row._id === excludeStoreId) continue
      const rowKey = row.nameKey || storeNameKey(row.name)
      if (rowKey !== nameKey) continue
      dup = row
      if (!row.nameKey && row._id) {
        await backfillStoreNameKey(row._id, row)
      }
      break
    }
  }

  if (dup) {
    const err = new Error('该门店名称已被使用，请换一个名称')
    err.code = 'STORE_NAME_EXISTS'
    throw err
  }
}

async function storeCheckName(payload) {
  const excludeStoreId =
    payload.excludeStoreId && isValidStoreId(payload.excludeStoreId)
      ? payload.excludeStoreId
      : ''
  try {
    await assertStoreNameAvailable(payload.name, excludeStoreId)
    return { available: true, name: normalizeStoreName(payload.name) }
  } catch (e) {
    if (e.code === 'STORE_NAME_EXISTS') {
      return { available: false, reason: e.message }
    }
    throw e
  }
}

/** 店员邀请预览：门店名称、联系人、脱敏电话、地址摘要 */
async function getStoreInvitePreview(storeId) {
  try {
    const res = await db.collection(STORES).doc(storeId).get()
    const store = res.data || {}
    return {
      storeName: (store.name || '').trim() || storeId,
      contactName: (store.contactName || '').trim(),
      contactPhoneMask: maskPhone(store.contactPhone),
      addressBrief: briefAddress(store)
    }
  } catch (e) {
    return {
      storeName: storeId,
      contactName: '',
      contactPhoneMask: '',
      addressBrief: ''
    }
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
      memberId: member._id,
      approvedAt: member.approvedAt || null
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
      customer: {
        _id: customer._id,
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

function resolveInviteEnvVersion(payload) {
  const v = (payload && payload.envVersion) || ''
  return v === 'develop' || v === 'trial' || v === 'release' ? v : 'release'
}

async function generateCustomerRegisterUrlLink(token, expireDays = 7, envVersion = 'release') {
  try {
    const res = await cloud.openapi.urllink.generate({
      path: 'pages/customer-register/register',
      query: `token=${encodeURIComponent(token)}`,
      is_expire: true,
      expire_type: 1,
      expire_interval: Math.min(30, Math.max(1, Math.ceil(expireDays))),
      env_version: envVersion
    })
    return (res && res.url_link) || ''
  } catch (err) {
    console.warn('[customerRegisterInvite] urllink.generate failed', err)
    return ''
  }
}

/** 官方小程序码（scene=token，打开 customer-register/register） */
async function generateCustomerRegisterWxacode(token, envVersion = 'release') {
  const scene = (token || '').trim()
  if (!scene) throw new Error('缺少注册邀请码')
  if (scene.length > 32) throw new Error('邀请码过长，无法生成小程序码')

  const env = resolveInviteEnvVersion({ envVersion })
  const result = await cloud.openapi.wxacode.getUnlimited({
    scene,
    page: 'pages/customer-register/register',
    check_path: env === 'release',
    env_version: env,
    width: 430
  })

  const buffer = Buffer.isBuffer(result) ? result : result && result.buffer
  if (!buffer || !buffer.length) {
    throw new Error('小程序码生成失败')
  }
  if (buffer[0] === 0x7b) {
    try {
      const json = JSON.parse(buffer.toString('utf8'))
      if (json.errcode) {
        throw new Error(json.errmsg || `微信接口错误 ${json.errcode}`)
      }
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e
    }
  }
  return buffer
}

async function customerRegisterInviteCreate(openid, payload) {
  const member = await requireActiveMember(openid)
  const storeId = member.storeId
  const token = generateInviteToken()
  const now = Date.now()
  const expireHours = Number(payload.expireHours) || 168
  const expireAt = now + expireHours * 3600 * 1000
  const registerPath = buildCustomerRegisterQrText(token)
  const envVersion = resolveInviteEnvVersion(payload)
  const expireDays = Math.min(30, Math.max(1, Math.ceil(expireHours / 24)))
  const urlLink = await generateCustomerRegisterUrlLink(token, expireDays, envVersion)
  const inviteLink = urlLink || registerPath

  await db.collection(CUSTOMER_REGISTER_INVITES).add({
    data: {
      token,
      storeId,
      createdBy: openid,
      status: 'active',
      expireAt,
      registerPath,
      urlLink: urlLink || null,
      inviteLink,
      createTime: now
    }
  })

  return { token, storeId, expireAt, registerPath, urlLink, inviteLink, envVersion }
}

function buildCustomerRegisterQrText(token) {
  const t = (token || '').trim()
  return `pages/customer-register/register?token=${encodeURIComponent(t)}`
}

/** 生成顾客注册小程序码 PNG（wxacode.getUnlimited → 云存储临时链接） */
async function customerRegisterInviteQrImage(openid, payload) {
  const member = await requireActiveMember(openid)
  const storeId = member.storeId
  const token = (payload.token || '').trim()
  if (!token) throw new Error('缺少注册邀请码')

  const invRes = await db
    .collection(CUSTOMER_REGISTER_INVITES)
    .where({ token, storeId, status: 'active' })
    .limit(1)
    .get()
  if (!invRes.data.length) throw new Error('注册邀请无效或已失效')

  const inv = invRes.data[0]
  const envVersion = resolveInviteEnvVersion(payload)
  let buffer
  try {
    buffer = await generateCustomerRegisterWxacode(token, envVersion)
  } catch (err) {
    console.error('[customerRegisterInvite] wxacode', err)
    const msg = (err && err.message) || '小程序码生成失败'
    throw new Error(
      msg.includes('小程序码') ? msg : `${msg}（未发布时请用体验版/开发版 env，或先发布正式版）`
    )
  }

  const cloudPath = `customer-invite-wxacode/${storeId}_${Date.now()}.png`
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  })
  const urlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] })
  const item = urlRes.fileList && urlRes.fileList[0]
  const registerPath = inv.registerPath || buildCustomerRegisterQrText(token)
  return {
    fileID: upload.fileID,
    tempFileURL: (item && item.tempFileURL) || '',
    scene: token,
    page: 'pages/customer-register/register',
    envVersion,
    inviteLink: inv.inviteLink || inv.urlLink || registerPath,
    registerPath
  }
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
  const name = normalizeStoreName(payload.name || 'AI写真馆')
  const contactName = (payload.contactName || '').trim()
  const contactPhone = (payload.contactPhone || '').trim()
  const mapAddress = (payload.mapAddress || '').trim() || (payload.address || '').trim()
  const houseNumber = (payload.houseNumber || '').trim()

  if (!contactName) throw new Error('请填写联系人')
  if (!contactPhone) throw new Error('请填写联系电话')
  if (!mapAddress) throw new Error('请先地图选点选择门店地址')
  const lat = payload.latitude
  const lng = payload.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('请通过地图选择门店地址')
  }

  await assertStoreNameAvailable(name)

  const fullAddress =
    (payload.address || '').trim() || [mapAddress, houseNumber].filter(Boolean).join(' ')

  // stores 主档：业务 ID 仅存在文档 _id（store_xxx），不在正文重复 storeId 字段
  const storeData = {
    accountType: 'store',
    name,
    nameKey: storeNameKey(name),
    contactName,
    contactPhone,
    address: fullAddress,
    mapAddress,
    addressName: (payload.addressName || '').trim(),
    addressDetail: (payload.addressDetail || '').trim(),
    distanceText: (payload.distanceText || '').trim(),
    houseNumber,
    latitude: lat,
    longitude: lng,
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
        phone: contactPhone,
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
        phone: contactPhone,
        remark: '',
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
  const row = res.data
  if (!row.nameKey && row.name) {
    await backfillStoreNameKey(member.storeId, row)
  }
  return { ...row, _id: member.storeId }
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
  if (data.name !== undefined) {
    data.name = normalizeStoreName(data.name)
    if (!data.name) throw new Error('请填写门店名称')
    await assertStoreNameAvailable(data.name, storeId)
    data.nameKey = storeNameKey(data.name)
  }
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

function buildStaffInviteQrText(token) {
  const t = (token || '').trim()
  return `pages/join/join?token=${encodeURIComponent(t)}`
}

/** 生成店员邀请二维码 PNG（云存储临时链接） */
async function inviteQrImage(openid, payload) {
  const storeId = payload.storeId
  if (!isValidStoreId(storeId)) throw new Error('门店ID无效')
  await requireOwner(openid, storeId)
  const token = (payload.token || '').trim()
  if (!token) throw new Error('缺少邀请码')

  const qrText = buildStaffInviteQrText(token)
  /* 背景与邀请卡藏青一致；码点为金色，便于深色底扫描 */
  const buffer = await QRCode.toBuffer(qrText, {
    type: 'png',
    width: 420,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#e8b86d', light: '#1a1a2e' }
  })

  const cloudPath = `staff-invite-qr/${storeId}_${Date.now()}.png`
  const upload = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer
  })
  const urlRes = await cloud.getTempFileURL({ fileList: [upload.fileID] })
  const item = urlRes.fileList && urlRes.fileList[0]
  return {
    fileID: upload.fileID,
    tempFileURL: (item && item.tempFileURL) || '',
    qrContent: qrText
  }
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

/** 消费已保存的手机号授权（提交申请时） */
async function consumePhoneAuth(openid, phoneAuthId) {
  const id = (phoneAuthId || '').trim()
  if (!id) return ''
  let row
  try {
    const res = await db.collection(PHONE_AUTH).doc(id).get()
    row = res.data
  } catch (e) {
    throw new Error('手机号授权已失效，请重新授权')
  }
  if (!row || row.memberOpenId !== openid) {
    throw new Error('手机号授权已失效，请重新授权')
  }
  if (row.used) throw new Error('手机号授权已使用，请重新授权')
  if (row.expireAt && row.expireAt < Date.now()) {
    throw new Error('手机号授权已过期，请重新授权')
  }
  await db.collection(PHONE_AUTH).doc(id).update({
    data: { used: true, updateTime: Date.now() }
  })
  return (row.phone || '').trim()
}

/**
 * 店员加入：用 phoneCode 换号并暂存（code 只能用一次，不可在 preview/accept 重复调）
 */
async function phoneAuthorizeForJoin(openid, payload) {
  const phone = await getPhoneFromCode(payload.phoneCode)
  const authId = `pa_${generateInviteToken()}`
  const now = Date.now()
  await db.collection(PHONE_AUTH).doc(authId).set({
    data: {
      memberOpenId: openid,
      phone,
      used: false,
      expireAt: now + 10 * 60 * 1000,
      createTime: now
    }
  })
  return { phoneMask: maskPhone(phone), phoneAuthId: authId }
}

async function phoneMaskFromCode(openid, payload) {
  return phoneAuthorizeForJoin(openid, payload)
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
  const storePreview = await getStoreInvitePreview(invite.storeId)
  return {
    storeId: invite.storeId,
    storeName: storePreview.storeName,
    contactName: storePreview.contactName,
    contactPhoneMask: storePreview.contactPhoneMask,
    addressBrief: storePreview.addressBrief,
    expireAt: invite.expireAt
  }
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

  const nickName = (payload.nickName || '').trim()
  if (!nickName) throw new Error('请填写你的称呼')

  let phone = ''
  if (payload.phoneAuthId) {
    phone = await consumePhoneAuth(openid, payload.phoneAuthId)
  } else if (payload.phoneCode) {
    phone = await getPhoneFromCode(payload.phoneCode)
  }

  const patch = { status: 'pending', updateTime: now, role: 'staff', nickName, remark: '' }
  // 本次未重新授权手机号时写入空串，避免沿用上一条申请（如被拒/移出后）留下的 phone
  patch.phone = phone || ''

  if (pending.data.length) {
    const row = pending.data[0]
    if (row.status === 'active') throw new Error('您已是本店成员')
    if (row.status === 'pending') throw new Error('已提交申请，请等待店长审核')
    await db.collection(MEMBERS).doc(row._id).update({ data: patch })
    return { storeId: invite.storeId, status: 'pending' }
  }

  await db.collection(MEMBERS).add({
    data: {
      storeId: invite.storeId,
      memberOpenId: openid,
      role: 'staff',
      status: 'pending',
      nickName,
      phone,
      remark: '',
      createTime: now,
      updateTime: now
    }
  })

  return { storeId: invite.storeId, status: 'pending' }
}

async function memberList(openid, payload) {
  const storeId = payload.storeId
  if (!isValidStoreId(storeId)) throw new Error('门店ID无效')
  const caller = await requireActiveMember(openid)
  if (caller.storeId !== storeId) throw new Error('无权查看该门店成员')

  const status = payload.status
  const where = status ? { storeId, status } : { storeId }
  const res = await db.collection(MEMBERS).where(where).orderBy('createTime', 'desc').limit(100).get()
  const isOwner = caller.role === 'owner'
  const list = (res.data || []).map((row) => {
    if (isOwner) return row
    const { phone, remark, ...rest } = row
    return rest
  })
  return { list, isOwner }
}

/** 店长维护员工备注、联系电话（不修改 nickName） */
async function memberUpdateProfile(openid, payload) {
  const storeId = payload.storeId
  const memberId = payload.memberId
  await requireOwner(openid, storeId)
  if (!memberId) throw new Error('缺少 memberId')

  const doc = await db.collection(MEMBERS).doc(memberId).get()
  const row = doc.data
  if (!row || row.storeId !== storeId) throw new Error('成员不存在')
  if (row.role === 'owner') throw new Error('无法修改店长资料')

  const data = { updateTime: Date.now() }
  if (payload.remark !== undefined) {
    data.remark = String(payload.remark || '').trim().slice(0, 200)
  }
  if (payload.phone !== undefined) {
    const phone = String(payload.phone || '').trim().replace(/\s/g, '')
    if (phone && !/^1\d{10}$/.test(phone)) {
      throw new Error('请输入正确的 11 位手机号')
    }
    data.phone = phone
  }
  if (Object.keys(data).length <= 1) throw new Error('没有可更新字段')

  await db.collection(MEMBERS).doc(memberId).update({ data })
  const updated = await db.collection(MEMBERS).doc(memberId).get()
  return updated.data
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
    data: {
      status: 'disabled',
      updateTime: Date.now(),
      rejectReason: payload.reason || '',
      remark: '',
      phone: ''
    }
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
    data: {
      status: 'disabled',
      updateTime: Date.now(),
      remark: '',
      phone: ''
    }
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
  const customerDocId = String(payload.customerDocId || '').trim()
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
  storeCheckName,
  inviteCreate,
  inviteQrImage,
  inviteRevoke,
  phoneAuthorizeForJoin,
  phoneMaskFromCode,
  invitePreview,
  inviteAccept,
  memberList,
  memberUpdateProfile,
  memberApprove,
  memberReject,
  memberDisable,
  requireActiveMember,
  getStoreName,
  platformSettingsGet,
  customerRegisterInviteCreate,
  customerRegisterInviteQrImage,
  batchLinkCustomer
}
