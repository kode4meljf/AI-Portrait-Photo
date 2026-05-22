const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const MOBILE_RE = /^1\d{10}$/

function normalizeMobilePhone(phone) {
  const p = String(phone || '').trim()
  if (!p) throw new Error('请填写手机号')
  if (!MOBILE_RE.test(p)) throw new Error('请输入正确的 11 位手机号')
  return p
}

async function getPhoneFromCode(phoneCode) {
  const code = (phoneCode || '').trim()
  if (!code) throw new Error('请先授权手机号')

  try {
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code })
    const info = res.phoneInfo || res
    const phone = (info.purePhoneNumber || info.phoneNumber || '').trim()
    if (!phone) throw new Error('未能获取手机号，请重试')
    return normalizeMobilePhone(phone)
  } catch (err) {
    console.error('[getPhoneFromCode]', err)
    throw new Error(err.message || '手机号授权失败，请重试')
  }
}

module.exports = { getPhoneFromCode, normalizeMobilePhone, MOBILE_RE }
