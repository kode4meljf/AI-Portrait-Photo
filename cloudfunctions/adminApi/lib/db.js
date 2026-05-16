const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const ORDER_STATUSES = ['待处理', '制作中', '已发货', '已完成']

function toDateString(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parsePage(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 20))
  return { page, pageSize, skip: (page - 1) * pageSize }
}

module.exports = {
  cloud,
  db,
  _,
  ORDER_STATUSES,
  toDateString,
  parsePage
}
