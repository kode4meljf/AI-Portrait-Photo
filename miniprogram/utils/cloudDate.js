/** 解析云数据库 / 云函数返回的时间字段 */
function parseCloudDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'object' && value.$date != null) return new Date(value.$date)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

module.exports = { parseCloudDate }
