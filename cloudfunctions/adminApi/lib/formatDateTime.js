/** 解析云数据库 / 云函数返回的时间字段 */
function parseCloudDate(value) {
  if (value == null || value === '') return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value.$date != null) return new Date(value.$date)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 后台展示用：固定北京时间，格式 YYYY-MM-DD HH:mm */
function formatDateTime(value) {
  const d = parseCloudDate(value)
  if (!d) return ''
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(d)
  const get = (type) => (parts.find((p) => p.type === type) || {}).value || ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

module.exports = {
  parseCloudDate,
  formatDateTime
}
