// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { startDate, endDate } = event
  try {
    // 实际开发中根据 startDate/endDate 聚合查询 frame_orders
    // 这里返回模拟数据，避免前端报错
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