const cloud = require('wx-server-sdk')
const { requireActiveMember, getStoreName } = require('./member')

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

async function submitStoreFeedback(openid, payload) {
  const member = await requireActiveMember(openid)
  const content = normalizeContent(payload.content)
  const contact = normalizeContact(payload.contact)
  const storeId = member.storeId || ''
  const storeName = storeId ? await getStoreName(storeId) : ''

  const now = Date.now()
  const res = await db.collection(COLLECTION).add({
    data: {
      sourceRole: 'store',
      content,
      contact,
      wxOpenId: openid,
      memberDocId: member._id || '',
      submitterName: (member.nickName || '').trim() || '门店成员',
      submitterPhone: (member.phone || '').trim(),
      storeId,
      storeName,
      memberRole: member.role || '',
      status: 'pending',
      createTime: now
    }
  })
  return { _id: res._id }
}

module.exports = { submitStoreFeedback }
