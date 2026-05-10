// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { storeId } = event
  try {
    // 实际开发中根据 storeId 查询 checkins 集合
    // 这里返回模拟数据
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