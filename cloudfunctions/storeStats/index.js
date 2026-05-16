const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

async function getOrderStats(event) {
  const { startDate, endDate } = event
  try {
    // TODO: 按 startDate / endDate 聚合 frame_orders
    return {
      totalAmount: 0,
      frameCount: 0,
      albumCount: 0
    }
  } catch (err) {
    return {
      totalAmount: 0,
      frameCount: 0,
      albumCount: 0
    }
  }
}

async function getCheckinStats(event) {
  const { storeId } = event
  try {
    // TODO: 按 storeId 查询打卡集合
    return {
      yesterdayCount: 0,
      todayCount: 0,
      todayUnchecked: 0
    }
  } catch (err) {
    return {
      yesterdayCount: 0,
      todayCount: 0,
      todayUnchecked: 0
    }
  }
}

exports.main = async (event) => {
  const action = event.action || ''
  if (action === 'order') {
    return getOrderStats(event)
  }
  if (action === 'checkin') {
    return getCheckinStats(event)
  }
  return {
    success: false,
    error: '未知 action，请使用 order 或 checkin'
  }
}
