/**
 * 小程序意见反馈提交 → 写入云库 user_feedback
 */
const { callCloudFunction } = require('./cloudCall')

function submitFeedback(role, payload) {
  const cloudName = role === 'store' ? 'storeMember' : 'customer'
  return callCloudFunction(cloudName, {
    action: 'feedback.submit',
    content: payload.content,
    contact: payload.contact
  })
}

module.exports = {
  submitFeedback
}
