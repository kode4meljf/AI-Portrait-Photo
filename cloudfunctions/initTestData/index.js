// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

const TEST_CUSTOMERS = [
  { nickName: '张小明', equityAlbum: 5, equityFrame: 3, totalCheckins: 12, avatarUrl: '' },
  { nickName: '李婷婷', equityAlbum: 8, equityFrame: 5, totalCheckins: 28, avatarUrl: '' },
  { nickName: '王建国', equityAlbum: 2, equityFrame: 1, totalCheckins: 5, avatarUrl: '' },
  { nickName: '陈丽娜', equityAlbum: 10, equityFrame: 8, totalCheckins: 45, avatarUrl: '' },
  { nickName: '刘伟', equityAlbum: 6, equityFrame: 4, totalCheckins: 18, avatarUrl: '' },
  { nickName: '赵雅静', equityAlbum: 3, equityFrame: 2, totalCheckins: 8, avatarUrl: '' },
  { nickName: '孙浩然', equityAlbum: 7, equityFrame: 6, totalCheckins: 22, avatarUrl: '' },
  { nickName: '周雨彤', equityAlbum: 4, equityFrame: 3, totalCheckins: 15, avatarUrl: '' },
  { nickName: '吴俊杰', equityAlbum: 9, equityFrame: 7, totalCheckins: 33, avatarUrl: '' },
  { nickName: '郑晓丽', equityAlbum: 1, equityFrame: 0, totalCheckins: 2, avatarUrl: '' },
]

exports.main = async (event, context) => {
  const { action = 'insert' } = event

  // 仅允许通过云函数内部调用，禁止外部传入任意 action
  const openid = cloud.getWXContext().OPENID

  try {
    if (action === 'clear') {
      // 清空所有客户数据（危险操作，仅测试用）
      const { deleted } = await db.collection('customers').remove({})
      return { success: true, message: '已清空 customers 集合', deleted }
    }

    // 插入测试数据
    const inserted = []
    for (const customer of TEST_CUSTOMERS) {
      const res = await db.collection('customers').add({ 
        data: { ...customer, storeId: openid }
      })
      inserted.push(res._id)
    }

    return {
      success: true,
      message: `成功插入 ${inserted.length} 条客户测试数据`,
      ids: inserted,
    }
  } catch (err) {
    return {
      success: false,
      message: '插入失败',
      error: err.message || err.errMsg,
    }
  }
}
