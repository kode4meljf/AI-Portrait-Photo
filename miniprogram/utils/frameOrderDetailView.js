const { getCustomerDisplayName } = require('./customerDisplay')

const PLACEHOLDER_THUMB = '/assets/icons/album-placeholder.png'
const STATUS_FLOW = ['待处理', '制作中', '已发货', '已完成']

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDateTime(date) {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function maskPhone(phone) {
  const p = String(phone || '').trim()
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(-4)}`
  return p
}

function defaultCompanyName(order, logistics) {
  return (logistics?.companyName || order.shippingCompanyName || '').trim() || '快递公司'
}

function mapApiTraces(traces) {
  return (Array.isArray(traces) ? traces : []).map((item, index) => ({
    time: item.time || '',
    msg: item.msg || '',
    active: index === 0,
    hint: false
  }))
}

function shouldQueryLogistics(order) {
  const status = order.status || '待处理'
  const shippingNo = (order.shippingNo || '').trim()
  return !!shippingNo && (status === '已发货' || status === '已完成')
}

/**
 * @param {object} order
 * @param {{ isStoreStaff?: boolean, storeName?: string, audience?: 'store'|'customer', logistics?: object, logisticsLoading?: boolean }} options
 */
function buildFrameOrderView(order, options = {}) {
  const isStoreStaff = !!options.isStoreStaff
  const audience = options.audience || (isStoreStaff ? 'store' : 'customer')
  const storeName = options.storeName || '当前门店'
  const logisticsLoading = !!options.logisticsLoading
  const logistics = options.logistics || null

  const status = order.status || '待处理'
  const stepIndex = Math.max(0, STATUS_FLOW.indexOf(status))
  const legacyPhoto = Array.isArray(order.photos) ? order.photos[0] : ''
  const photoUrl = order.photoUrl || legacyPhoto || ''
  const customer = order.customerInfo || null
  const shippingNo = (order.shippingNo || '').trim()
  const companyName = defaultCompanyName(order, logistics)
  const needLogisticsQuery = shouldQueryLogistics(order)

  let traces = []
  let logisticsMode = 'empty'
  let logisticsEmptyIcon = '📦'
  let logisticsEmptyTitle = ''
  let logisticsEmptySub = ''
  let showCopyShipping = false
  let showLogisticsStrip = false
  let stripTrace = null

  if (needLogisticsQuery) {
    showCopyShipping = true
    if (logisticsLoading) {
      logisticsMode = 'loading'
      logisticsEmptyTitle = '正在查询物流…'
      logisticsEmptySub = '请稍候'
    } else if (logistics && !logistics.empty && logistics.traces?.length) {
      traces = mapApiTraces(logistics.traces)
      logisticsMode = status === '已完成' ? 'done' : 'timeline'
      showLogisticsStrip = status === '已发货'
      stripTrace = traces[0] || null
    } else if (logistics && logistics.empty) {
      logisticsMode = 'empty'
      logisticsEmptyIcon = '📭'
      logisticsEmptyTitle = '暂无物流信息'
      logisticsEmptySub = logistics.message || '暂未查询到物流轨迹，请下拉刷新'
    } else {
      logisticsMode = 'loading'
      logisticsEmptyTitle = '正在查询物流…'
      logisticsEmptySub = '请稍候'
    }
  }

  const latestTrace = stripTrace || traces[0]

  const steps = STATUS_FLOW.map((label, i) => ({
    label,
    done: status === '已完成' ? true : i < stepIndex,
    active: status === '已完成' ? false : i === stepIndex
  }))

  const trackPercents = ['0%', '33%', '66%', '100%']
  const trackWidth = trackPercents[stepIndex] || '0%'

  let heroClass = ''
  let heroTitle = ''
  let heroSub = ''
  let logisticsBeforePreview = false

  switch (status) {
    case '待处理':
      heroClass = 'pending-bg'
      heroTitle = audience === 'customer' ? '订单待处理' : '待店长确认制作'
      heroSub =
        audience === 'customer'
          ? '门店确认后将开始制作，预计 3–5 个工作日'
          : '确认后将扣减 99 积分并开始制作，预计 3–5 个工作日'
      logisticsEmptyIcon = '📦'
      logisticsEmptyTitle = audience === 'customer' ? '等待门店确认制作' : '确认制作后进入生产流程'
      logisticsEmptySub = '发货后将在此展示物流轨迹'
      break
    case '制作中':
      heroTitle = '工厂制作中'
      heroSub =
        audience === 'customer'
          ? '正在冲印与装裱，完成后将安排发货'
          : '正在冲印与装裱，完成后将录入快递单号并通知您'
      logisticsEmptyIcon = '🏭'
      logisticsEmptyTitle = '制作中，暂未发货'
      logisticsEmptySub =
        audience === 'customer' ? '有运单号后将自动更新' : '有运单号后将自动更新，如有疑问可联系平台'
      break
    case '已发货':
      heroClass = 'shipped-bg'
      heroTitle = latestTrace?.msg && logisticsMode === 'timeline' ? '包裹运输中' : '已发货'
      heroSub = shippingNo
        ? latestTrace?.msg && logisticsMode === 'timeline'
          ? `${companyName} ${shippingNo}`
          : `运单号 ${shippingNo}`
        : '物流单号录入中，请稍后查看'
      logisticsBeforePreview = true
      if (!shippingNo) {
        logisticsMode = 'empty'
        logisticsEmptyIcon = '🚚'
        logisticsEmptyTitle = '已发货，待录入运单号'
        logisticsEmptySub = '请稍后再查看或联系门店'
        showCopyShipping = false
        showLogisticsStrip = false
      }
      break
    case '已完成':
      heroTitle = '订单已完成'
      heroSub = shippingNo
        ? logisticsMode === 'done' && latestTrace?.msg
          ? `${companyName} ${shippingNo} · 已确认签收`
          : `运单号 ${shippingNo} · 已确认签收`
        : audience === 'customer'
          ? '感谢您的耐心等待'
          : '感谢使用，欢迎带客户再次体验 AI 写真摆台'
      if (!shippingNo) {
        logisticsMode = 'empty'
        logisticsEmptyIcon = '✓'
        logisticsEmptyTitle = '订单已完成'
        logisticsEmptySub = '本单无物流记录'
        showCopyShipping = false
      }
      break
    default:
      heroTitle = status
      heroSub = ''
  }

  const wxNick = (customer?.wxNickName || '').trim()
  const phoneMasked = maskPhone(customer?.phone)
  let customerDesc = ''
  if (wxNick && phoneMasked) customerDesc = `微信：${wxNick} · ${phoneMasked}`
  else if (wxNick) customerDesc = `微信：${wxNick}`
  else if (phoneMasked) customerDesc = phoneMasked

  const updateTime = order.updateTime || order.createTime
  const showCustomerSection = audience === 'store' && !!order.customerId

  return {
    ...order,
    photoUrl: photoUrl || PLACEHOLDER_THUMB,
    createTimeStr: formatDateTime(order.createTime),
    updateTimeStr: formatDateTime(updateTime),
    showUpdateTime: status !== '待处理',
    storeName,
    displayCustomerName: getCustomerDisplayName(customer),
    customerDesc,
    customerAvatar: customer?.avatarUrl || '',
    hasCustomer: showCustomerSection,
    heroClass,
    heroTitle,
    heroSub,
    steps,
    trackWidth,
    logisticsBeforePreview,
    showLogisticsStrip,
    stripLatest: latestTrace?.msg || '',
    stripMeta: shippingNo
      ? `${companyName} ${shippingNo}${latestTrace?.time ? ` · ${latestTrace.time}` : ''}`
      : '',
    logisticsMode,
    logisticsLoading,
    logisticsEmptyIcon,
    logisticsEmptyTitle,
    logisticsEmptySub,
    logisticsCompany: companyName,
    shippingNo,
    traces,
    showCopyShipping,
    showGhostCopy: !!showCopyShipping,
    showContactPlatform: isStoreStaff && !showCopyShipping,
    showBottomGhost: !!showCopyShipping || (isStoreStaff && !showCopyShipping),
    showBottomBar: !!showCopyShipping || (isStoreStaff && !showCopyShipping) || (isStoreStaff && status !== '已完成'),
    showPrimaryAction: isStoreStaff && status !== '已完成',
    showConfirmProduction: isStoreStaff && status === '待处理',
    showViewLogistics: isStoreStaff && status === '制作中',
    showConfirmReceipt: isStoreStaff && status === '已发货',
    primaryBtnText:
      status === '待处理'
        ? '确认制作'
        : status === '制作中'
          ? '查看物流'
          : status === '已发货'
            ? '确认签收'
            : '',
    primaryBtnClass: status === '待处理' ? 'orange' : status === '已发货' ? 'green' : ''
  }
}

module.exports = {
  PLACEHOLDER_THUMB,
  buildFrameOrderView,
  shouldQueryLogistics
}
