// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const { generateCustomerId } = require('./lib/storeId')

const TEST_CUSTOMERS = [
  { nickName: '张小明', phone: '13800010001', equityAlbum: 5, equityFrame: 3, totalCheckins: 12, avatarUrl: '' },
  { nickName: '李婷婷', phone: '13800010002', equityAlbum: 8, equityFrame: 5, totalCheckins: 28, avatarUrl: '' },
  { nickName: '王建国', phone: '13800010003', equityAlbum: 2, equityFrame: 1, totalCheckins: 5, avatarUrl: '' },
  { nickName: '陈丽娜', phone: '13800010004', equityAlbum: 10, equityFrame: 8, totalCheckins: 45, avatarUrl: '' },
  { nickName: '刘伟', phone: '13800010005', equityAlbum: 6, equityFrame: 4, totalCheckins: 18, avatarUrl: '' },
  { nickName: '赵雅静', phone: '13800010006', equityAlbum: 3, equityFrame: 2, totalCheckins: 8, avatarUrl: '' },
  { nickName: '孙浩然', phone: '13800010007', equityAlbum: 7, equityFrame: 6, totalCheckins: 22, avatarUrl: '' },
  { nickName: '周雨彤', phone: '13800010008', equityAlbum: 4, equityFrame: 3, totalCheckins: 15, avatarUrl: '' },
  { nickName: '吴俊杰', phone: '13800010009', equityAlbum: 9, equityFrame: 7, totalCheckins: 33, avatarUrl: '' },
  { nickName: '郑晓丽', phone: '13800010010', equityAlbum: 1, equityFrame: 0, totalCheckins: 2, avatarUrl: '' }
]

/** 新增 4 条模拟客户（客户列表预览用） */
const SAMPLE_CUSTOMERS_EXTRA = [
  { nickName: '林思琪', phone: '13800020001', equityAlbum: 5, equityFrame: 3, totalCheckins: 6, avatarUrl: '' },
  { nickName: '黄梓轩', phone: '13800020002', equityAlbum: 2, equityFrame: 1, totalCheckins: 3, avatarUrl: '' },
  { nickName: '马晓雯', phone: '13800020003', equityAlbum: 12, equityFrame: 6, totalCheckins: 21, avatarUrl: '' },
  { nickName: '何志明', phone: '13800020004', equityAlbum: 0, equityFrame: 0, totalCheckins: 1, avatarUrl: '' }
]

async function insertCustomers(list, storeId, { skipExistingByPhone = false } = {}) {
  const inserted = []
  const skipped = []
  const now = Date.now()

  for (let i = 0; i < list.length; i++) {
    const customer = list[i]
    const phone = (customer.phone || '').trim()

    if (skipExistingByPhone && phone) {
      const exist = await db.collection('customers').where({ storeId, phone }).limit(1).get()
      if (exist.data && exist.data.length) {
        skipped.push(phone)
        continue
      }
    }

    const res = await db.collection('customers').add({
      data: {
        ...customer,
        customerId: generateCustomerId(),
        storeId,
        source: 'store_create',
        phone,
        totalCheckins: customer.totalCheckins || 0,
        createTime: now - i * 60000,
        updateTime: now
      }
    })
    inserted.push(res._id)
  }

  return { inserted, skipped }
}

exports.main = async (event) => {
  const { action = 'insert' } = event
  const storeId = (event && event.storeId) || 'store_demo_test01'

  try {
    if (action === 'clear') {
      const { deleted } = await db.collection('customers').where({ storeId }).remove()
      return { success: true, message: '已清空本店客户数据', deleted }
    }

    if (action === 'insertSample4') {
      const { inserted, skipped } = await insertCustomers(SAMPLE_CUSTOMERS_EXTRA, storeId, {
        skipExistingByPhone: true
      })
      return {
        success: true,
        message: `已插入 ${inserted.length} 条模拟客户${skipped.length ? `，${skipped.length} 条已存在已跳过` : ''}`,
        inserted: inserted.length,
        skipped: skipped.length,
        ids: inserted
      }
    }

    const { inserted } = await insertCustomers(TEST_CUSTOMERS, storeId, { skipExistingByPhone: false })
    return {
      success: true,
      message: `成功插入 ${inserted.length} 条客户测试数据`,
      ids: inserted
    }
  } catch (err) {
    return {
      success: false,
      message: '插入失败',
      error: err.message || err.errMsg
    }
  }
}
