const cloud = require('wx-server-sdk')
const { getCustomerByOpenId, getStoreName } = require('./register')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTION = 'user_feedback'

function normalizeContent(content) {
  const text = String(content || '').trim()
  if (!text) throw new Error('请输入反馈内容')
  if (text.length > 500) throw new Error('反馈内容不能超过500字')
  return text
}

function normalizeContact(contact) {
  return String(contact || '').trim().slice(0, 50)
}

async function submitCustomerFeedback(openid, payload) {
  if (!openid) throw new Error('未登录')

  const content = normalizeContent(payload.content)
  const contact = normalizeContact(payload.contact)
  const customer = await getCustomerByOpenId(openid)

  const storeId = (customer && customer.storeId) || ''
  const storeName = storeId ? await getStoreName(storeId) : ''
  const submitterName = customer
    ? ((customer.wxNickName || customer.nickName || '').trim() || '顾客')
    : '顾客'
  const submitterPhone = (customer && customer.phone) || ''

  const now = Date.now()
  const res = await db.collection(COLLECTION).add({
    data: {
      sourceRole: 'customer',
      content,
      contact,
      wxOpenId: openid,
      customerDocId: customer ? customer._id : '',
      submitterName,
      submitterPhone,
      storeId,
      storeName,
      status: 'pending',
      createTime: now
    }
  })
  return { _id: res._id }
}

module.exports = { submitCustomerFeedback }
