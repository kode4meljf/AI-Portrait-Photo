const crypto = require('crypto')
const { db } = require('./db')

const CODE_COLLECTION = 'admin_verify_codes'
const PURPOSE_STORE_ASSET = 'store_asset_adjust'
const CODE_TTL_MS = 5 * 60 * 1000
const SEND_COOLDOWN_MS = 60 * 1000

function isSmsMock() {
  return process.env.ADMIN_SMS_MOCK === 'true' || process.env.ADMIN_SMS_MOCK === '1'
}

function getAdminPhone() {
  const phone = String(process.env.ADMIN_VERIFY_PHONE || '').trim()
  if (!/^1\d{10}$/.test(phone)) {
    throw new Error('请在云函数环境变量配置管理员手机号 ADMIN_VERIFY_PHONE（11 位）')
  }
  return phone
}

function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

function hashCode(phone, code) {
  const salt = process.env.ADMIN_JWT_SECRET || process.env.ADMIN_API_SECRET || 'sms-salt'
  return crypto.createHash('sha256').update(`${phone}:${code}:${salt}`).digest('hex')
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function sendTencentSms(phone, code) {
  let SmsClient
  try {
    SmsClient = require('tencentcloud-sdk-nodejs').sms.v20210111.Client
  } catch {
    throw new Error('未安装短信 SDK，请在 adminApi 目录执行 npm install 后重新部署')
  }

  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  const sdkAppId = process.env.SMS_SDK_APP_ID
  const templateId = process.env.SMS_TEMPLATE_ID
  const signName = process.env.SMS_SIGN_NAME

  if (!secretId || !secretKey || !sdkAppId || !templateId || !signName) {
    throw new Error(
      '短信未配置完整，请设置 TENCENT_SECRET_ID、TENCENT_SECRET_KEY、SMS_SDK_APP_ID、SMS_TEMPLATE_ID、SMS_SIGN_NAME'
    )
  }

  const client = new SmsClient({
    credential: { secretId, secretKey },
    region: process.env.SMS_REGION || 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } }
  })

  const res = await client.SendSms({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: sdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [code]
  })

  const status = res.SendStatusSet && res.SendStatusSet[0]
  if (!status || status.Code !== 'Ok') {
    const msg = (status && status.Message) || '短信发送失败'
    throw new Error(msg)
  }
}

async function assertSendCooldown(phone, purpose) {
  const res = await db
    .collection(CODE_COLLECTION)
    .where({ phone, purpose })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get()
  const last = res.data[0]
  if (!last) return
  const t = last.createTime instanceof Date ? last.createTime.getTime() : new Date(last.createTime).getTime()
  if (Date.now() - t < SEND_COOLDOWN_MS) {
    throw new Error('发送太频繁，请 60 秒后再试')
  }
}

async function sendAdminVerifyCode({ purpose, refId }) {
  const phone = getAdminPhone()
  await assertSendCooldown(phone, purpose)

  const code = generateCode()
  const now = Date.now()
  const expireAt = now + CODE_TTL_MS

  if (isSmsMock()) {
    console.log(`[ADMIN_SMS_MOCK] purpose=${purpose} ref=${refId || ''} phone=${phone} code=${code}`)
  } else {
    await sendTencentSms(phone, code)
  }

  await db.collection(CODE_COLLECTION).add({
    data: {
      phone,
      purpose,
      refId: refId || '',
      codeHash: hashCode(phone, code),
      expireAt,
      createTime: new Date(),
      used: false
    }
  })

  return {
    phoneMasked: maskPhone(phone),
    expireIn: Math.floor(CODE_TTL_MS / 1000),
    mock: isSmsMock()
  }
}

async function verifyAdminCode({ code, purpose, refId }) {
  const phone = getAdminPhone()
  const raw = String(code || '').trim()
  if (!/^\d{6}$/.test(raw)) throw new Error('请输入 6 位验证码')

  if (isSmsMock() && raw === (process.env.ADMIN_SMS_MOCK_CODE || '123456')) {
    return { phone, mock: true }
  }

  const res = await db
    .collection(CODE_COLLECTION)
    .where({ phone, purpose, used: false })
    .orderBy('createTime', 'desc')
    .limit(10)
    .get()

  const now = Date.now()
  const hash = hashCode(phone, raw)
  const row = res.data.find((item) => {
    if (item.codeHash !== hash) return false
    const exp = item.expireAt instanceof Date ? item.expireAt.getTime() : Number(item.expireAt)
    if (!exp || exp < now) return false
    if (refId && item.refId && item.refId !== refId) return false
    return true
  })

  if (!row) throw new Error('验证码错误或已过期')

  await db.collection(CODE_COLLECTION).doc(row._id).update({
    data: { used: true, usedAt: new Date() }
  })

  return { phone, mock: false }
}

module.exports = {
  PURPOSE_STORE_ASSET,
  sendAdminVerifyCode,
  verifyAdminCode,
  maskPhone,
  getAdminPhone
}
