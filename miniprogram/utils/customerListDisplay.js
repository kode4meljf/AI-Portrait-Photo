/**
 * 客户列表行展示（首页 customer-picker / 工作台客户列表共用）
 */
const { getCustomerDisplayName } = require('./customerDisplay')

const AVATAR_BG = ['#4e7cf6', '#5ac8a8', '#f5a623', '#e85d75', '#8b6fd4', '#3db0e4', '#7ebc59', '#d94dbb']

function isToday(timestamp) {
  if (!timestamp) return false
  const d = new Date(timestamp)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

function pickAvatarTint(key) {
  const s = String(key || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_BG[h % AVATAR_BG.length]
}

function initialFromName(name) {
  const t = (name || '').trim()
  if (!t) return '客'
  return t.slice(0, 1)
}

function mapCustomerRow(c) {
  const nick = c.nickName || c.wxNickName || ''
  return {
    ...c,
    todayCheckedIn: isToday(c.lastCheckinTime || c.lastCheckinDate),
    displayName: getCustomerDisplayName(c),
    avatarInitial: initialFromName(c.nickName || c.wxNickName),
    avatarTint: pickAvatarTint(c._id || nick)
  }
}

function calcListStats(customers) {
  const totalCustomers = customers.length
  const totalCheckins = customers.reduce((sum, c) => sum + (c.totalCheckins || 0), 0)
  return { totalCustomers, totalCheckins }
}

module.exports = {
  isToday,
  pickAvatarTint,
  initialFromName,
  mapCustomerRow,
  calcListStats
}
