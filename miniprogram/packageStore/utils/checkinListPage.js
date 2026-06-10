/**
 * 门店端打卡名单页：数据整理、排序、展示字段
 */
const { formatDate, getCurrentDate, daysBetween } = require('./date')
const { mapCustomerRow } = require('../../utils/customerListDisplay')

const WEEKDAY = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function maskPhone(phone) {
  const p = String(phone || '').trim()
  if (!p) return '未绑定手机'
  if (/^\d{11}$/.test(p)) return `${p.slice(0, 3)}****${p.slice(7)}`
  return p
}

function formatWeekdayLine(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T12:00:00`)
  if (isNaN(d.getTime())) return dateStr
  return `${dateStr} · ${WEEKDAY[d.getDay()]}`
}

function formatCheckinTime(ts) {
  if (!ts) return ''
  return `${formatDate(ts, 'HH:mm')} 到店`
}

function formatLastVisit(customer) {
  const raw = customer.lastCheckinTime || customer.lastCheckinDate
  if (!raw) {
    const total = Number(customer.totalCheckins) || 0
    return total > 0 ? '上次到店 —' : '从未到店 · 预建档'
  }
  let dateStr = ''
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    dateStr = raw.trim()
  } else {
    dateStr = formatDate(raw, 'yyyy-MM-dd')
  }
  if (!dateStr) return '上次到店 —'
  const parts = dateStr.split('-')
  const short = parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : dateStr
  return `上次到店 ${short}`
}

function daysSinceLastVisit(customer, todayStr) {
  const raw = customer.lastCheckinTime || customer.lastCheckinDate
  if (raw) {
    let dateStr = ''
    if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
      dateStr = raw.trim()
    } else {
      dateStr = formatDate(raw, 'yyyy-MM-dd')
    }
    if (dateStr) return daysBetween(dateStr, todayStr || getCurrentDate())
  }
  if (customer.createTime) {
    return daysBetween(formatDate(customer.createTime, 'yyyy-MM-dd'), todayStr || getCurrentDate())
  }
  return 9999
}

/** 合并 checkinDate / createTime 查询，取每位客户当日最晚打卡时间 */
function mergeDayCheckinMap(rows) {
  const map = new Map()
  for (const row of rows || []) {
    const id = (row.customerDocId || '').trim()
    if (!id) continue
    const t = Number(row.createTime) || 0
    const prev = map.get(id)
    if (prev == null || t > prev) map.set(id, t)
  }
  return map
}

function resolveMode(options) {
  if (options.mode === 'checked' || options.mode === 'unchecked') return options.mode
  if (options.type === 'checked') return 'checked'
  if (options.type === 'unchecked') return 'unchecked'
  return 'checked'
}

function resolveNavTitle(mode, dateStr) {
  const today = getCurrentDate()
  if (mode === 'unchecked') return '今日尚未打卡'
  if (dateStr === today) return '今日已打卡'
  return '昨日已打卡'
}

function buildSummary({ mode, dateStr, totalCustomers, listCount }) {
  const rate =
    totalCustomers > 0 ? Math.round((listCount / totalCustomers) * 100) : 0
  if (mode === 'unchecked') {
    return {
      dateLine: `${dateStr} · 今日截止当前`,
      headline: `${listCount} 人尚未打卡`,
      subline: '建议营业结束前回访或电话提醒',
      variant: 'warning'
    }
  }
  return {
    dateLine: formatWeekdayLine(dateStr),
    headline: `${listCount} 人已到店`,
    subline: `在册客户 ${totalCustomers} 人 · 到店率 ${rate}%`,
    variant: dateStr === getCurrentDate() ? 'success' : 'neutral'
  }
}

function matchesSearch(customer, keyword) {
  if (!keyword) return true
  const kw = keyword.trim().toLowerCase()
  if (!kw) return true
  const name = (customer.nickName || customer.wxNickName || '').toLowerCase()
  const phone = String(customer.phone || '')
  return name.includes(kw) || phone.includes(kw)
}

function mapListRow(customer, ctx) {
  const base = mapCustomerRow(customer)
  const row = {
    ...base,
    phoneMasked: maskPhone(customer.phone),
    metaLine: `累计打卡 ${Number(customer.totalCheckins) || 0} 次`
  }
  if (ctx.mode === 'checked') {
    const ts = ctx.checkinMap.get(customer._id)
    row.pillText = formatCheckinTime(ts)
    row.pillTone = ctx.dateStr === getCurrentDate() ? 'success' : 'neutral'
    row.sortTime = ts || 0
  } else {
    const followUpDates = Array.isArray(customer.followUpDates) ? customer.followUpDates : []
    const followed = ctx.dateStr && followUpDates.includes(ctx.dateStr)
    row.pillText = followed ? '已跟进' : '待跟进'
    row.pillTone = followed ? 'success' : 'warning'
    row.metaLine = `${formatLastVisit(customer)} · 累计 ${Number(customer.totalCheckins) || 0} 次`
    row.daysSinceVisit = daysSinceLastVisit(customer, ctx.dateStr)
    row.sortTime = row.daysSinceVisit
  }
  return row
}

function sortList(rows, sortKey, mode) {
  const list = rows.slice()
  if (sortKey === 'name') {
    list.sort((a, b) =>
      (a.displayName || '').localeCompare(b.displayName || '', 'zh-CN')
    )
    return list
  }
  if (mode === 'checked') {
    list.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
    return list
  }
  list.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0))
  return list
}

function filterByChips(rows, { mode, sortKey, wxOnly, streakOnly }) {
  let list = rows
  if (mode === 'checked' && wxOnly) {
    list = list.filter((c) => !!(c.wxOpenId || '').trim())
  }
  if (mode === 'unchecked' && streakOnly) {
    list = list.filter((c) => (c.daysSinceVisit || 0) >= 3)
  }
  return list
}

function emptyHint({ mode, searchKeyword, dateStr }) {
  if (searchKeyword) return '未找到匹配的客户'
  if (mode === 'checked') {
    return dateStr === getCurrentDate() ? '今日尚无人到店' : '当日尚无人到店'
  }
  return '全部客户今日均已打卡'
}

function emptySubHint(mode) {
  if (mode === 'checked') {
    return '提醒客户出示小程序打卡码，或在首页扫码打卡'
  }
  return ''
}

module.exports = {
  maskPhone,
  formatWeekdayLine,
  mergeDayCheckinMap,
  resolveMode,
  resolveNavTitle,
  buildSummary,
  matchesSearch,
  mapListRow,
  sortList,
  filterByChips,
  emptyHint,
  emptySubHint,
  daysSinceLastVisit
}
