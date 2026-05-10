// cloudfunctions/initData/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const storeId = wxContext.OPENID   // 使用当前用户的 openId 作为门店ID

  // 清理旧数据（可选，注意会删除所有原有数据，谨慎使用）
  // await db.collection('batches').where({}).remove()
  // await db.collection('photos').where({}).remove()
  // await db.collection('frame_orders').where({}).remove()
  // await db.collection('customers').where({}).remove()
  // await db.collection('checkins').where({}).remove()

  // 1. 插入客户
  const customers = [
    { _id: 'customer_001', openId: 'mock_openid_1', nickName: '李小姐', avatarUrl: 'https://picsum.photos/100/100?random=1', phone: '13800138001', storeId, totalCheckins: 5, equityAlbum: 3, equityFrame: 2, createTime: db.serverDate() },
    { _id: 'customer_002', openId: 'mock_openid_2', nickName: '王女士', avatarUrl: 'https://picsum.photos/100/100?random=2', phone: '13800138002', storeId, totalCheckins: 8, equityAlbum: 5, equityFrame: 3, createTime: db.serverDate() },
    { _id: 'customer_003', openId: 'mock_openid_3', nickName: '张先生', avatarUrl: 'https://picsum.photos/100/100?random=3', phone: '13800138003', storeId, totalCheckins: 2, equityAlbum: 1, equityFrame: 1, createTime: db.serverDate() }
  ]
  for (const c of customers) {
    await db.collection('customers').doc(c._id).set({ data: c }).catch(e => console.error(e))
  }

  // 2. 插入批次
  const batches = [
    { _id: 'batch_001', storeId, customerId: 'customer_001', createTime: new Date('2026-04-20T10:00:00Z'), status: 'completed', photoIds: ['photo_001','photo_002','photo_003'] },
    { _id: 'batch_002', storeId, customerId: 'customer_001', createTime: new Date('2026-04-15T14:30:00Z'), status: 'generating', photoIds: ['photo_004','photo_005','photo_006','photo_007','photo_008','photo_009'] },
    { _id: 'batch_003', storeId, customerId: 'customer_002', createTime: new Date('2026-04-10T09:15:00Z'), status: 'completed', photoIds: ['photo_010','photo_011','photo_012','photo_013','photo_014','photo_015'] },
    { _id: 'batch_004', storeId, customerId: 'customer_003', createTime: new Date('2026-03-28T16:20:00Z'), status: 'completed', photoIds: ['photo_016','photo_017'] }
  ]
  for (const b of batches) {
    await db.collection('batches').add({ data: b }).catch(e => console.error(e))
  }

  // 3. 插入照片
  const photos = [
    // batch_001 (3张，全部已生成)
    { _id: 'photo_001', batchId: 'batch_001', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=101', aiUrl: 'https://picsum.photos/400/400?random=201', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-20T10:05:00Z'), updateTime: null },
    { _id: 'photo_002', batchId: 'batch_001', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=102', aiUrl: 'https://picsum.photos/400/400?random=202', isGenerated: true, isFavorite: true, createTime: new Date('2026-04-20T10:06:00Z'), updateTime: null },
    { _id: 'photo_003', batchId: 'batch_001', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=103', aiUrl: 'https://picsum.photos/400/400?random=203', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-20T10:07:00Z'), updateTime: null },
    // batch_002 (6张，其中3张已生成 -> 状态为“生成中 3/6”)
    { _id: 'photo_004', batchId: 'batch_002', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=104', aiUrl: null, isGenerated: false, isFavorite: false, createTime: new Date('2026-04-15T14:35:00Z'), updateTime: null },
    { _id: 'photo_005', batchId: 'batch_002', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=105', aiUrl: null, isGenerated: false, isFavorite: false, createTime: new Date('2026-04-15T14:36:00Z'), updateTime: null },
    { _id: 'photo_006', batchId: 'batch_002', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=106', aiUrl: 'https://picsum.photos/400/400?random=206', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-15T14:37:00Z'), updateTime: null },
    { _id: 'photo_007', batchId: 'batch_002', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=107', aiUrl: 'https://picsum.photos/400/400?random=207', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-15T14:38:00Z'), updateTime: null },
    { _id: 'photo_008', batchId: 'batch_002', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=108', aiUrl: null, isGenerated: false, isFavorite: false, createTime: new Date('2026-04-15T14:39:00Z'), updateTime: null },
    { _id: 'photo_009', batchId: 'batch_002', storeId, customerId: 'customer_001', originalUrl: 'https://picsum.photos/400/400?random=109', aiUrl: null, isGenerated: false, isFavorite: false, createTime: new Date('2026-04-15T14:40:00Z'), updateTime: null },
    // batch_003 (6张，全部已生成 -> 状态“已完成”)
    { _id: 'photo_010', batchId: 'batch_003', storeId, customerId: 'customer_002', originalUrl: 'https://picsum.photos/400/400?random=110', aiUrl: 'https://picsum.photos/400/400?random=210', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-10T09:20:00Z'), updateTime: null },
    { _id: 'photo_011', batchId: 'batch_003', storeId, customerId: 'customer_002', originalUrl: 'https://picsum.photos/400/400?random=111', aiUrl: 'https://picsum.photos/400/400?random=211', isGenerated: true, isFavorite: true, createTime: new Date('2026-04-10T09:21:00Z'), updateTime: null },
    { _id: 'photo_012', batchId: 'batch_003', storeId, customerId: 'customer_002', originalUrl: 'https://picsum.photos/400/400?random=112', aiUrl: 'https://picsum.photos/400/400?random=212', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-10T09:22:00Z'), updateTime: null },
    { _id: 'photo_013', batchId: 'batch_003', storeId, customerId: 'customer_002', originalUrl: 'https://picsum.photos/400/400?random=113', aiUrl: 'https://picsum.photos/400/400?random=213', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-10T09:23:00Z'), updateTime: null },
    { _id: 'photo_014', batchId: 'batch_003', storeId, customerId: 'customer_002', originalUrl: 'https://picsum.photos/400/400?random=114', aiUrl: 'https://picsum.photos/400/400?random=214', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-10T09:24:00Z'), updateTime: null },
    { _id: 'photo_015', batchId: 'batch_003', storeId, customerId: 'customer_002', originalUrl: 'https://picsum.photos/400/400?random=115', aiUrl: 'https://picsum.photos/400/400?random=215', isGenerated: true, isFavorite: false, createTime: new Date('2026-04-10T09:25:00Z'), updateTime: null },
    // batch_004 (2张)
    { _id: 'photo_016', batchId: 'batch_004', storeId, customerId: 'customer_003', originalUrl: 'https://picsum.photos/400/400?random=116', aiUrl: 'https://picsum.photos/400/400?random=216', isGenerated: true, isFavorite: false, createTime: new Date('2026-03-28T16:25:00Z'), updateTime: null },
    { _id: 'photo_017', batchId: 'batch_004', storeId, customerId: 'customer_003', originalUrl: 'https://picsum.photos/400/400?random=117', aiUrl: 'https://picsum.photos/400/400?random=217', isGenerated: true, isFavorite: false, createTime: new Date('2026-03-28T16:26:00Z'), updateTime: null }
  ]
  for (const p of photos) {
    await db.collection('photos').doc(p._id).set({ data: p }).catch(e => console.error(e))
  }

  // 4. 插入订单
  const orders = [
    { _id: 'order_001', orderNo: 'OR20260420001', storeId, customerId: 'customer_001', frameTemplateId: 'frame_001', frameName: 'AI 油画质感写真', size: '20cm×20cm', material: '水晶工艺', price: 9.9, status: '待处理', shippingNo: null, photos: ['https://picsum.photos/400/400?random=201'], createTime: new Date('2026-04-20T14:22:00Z'), estimatedCompleteTime: null },
    { _id: 'order_002', orderNo: 'OR20260415002', storeId, customerId: 'customer_001', frameTemplateId: 'frame_002', frameName: 'AI 法式浪漫写真', size: '20cm×20cm', material: '实木工艺', price: 19.9, status: '制作中', shippingNo: null, photos: ['https://picsum.photos/400/400?random=206'], createTime: new Date('2026-04-15T11:05:00Z'), estimatedCompleteTime: new Date('2026-04-25T00:00:00Z') },
    { _id: 'order_003', orderNo: 'OR20260328003', storeId, customerId: 'customer_002', frameTemplateId: 'frame_003', frameName: 'AI 杂志封面写真', size: '20cm×20cm', material: '水晶工艺', price: 9.9, status: '已发货', shippingNo: 'SF1234567890', photos: ['https://picsum.photos/400/400?random=210'], createTime: new Date('2026-03-28T16:40:00Z'), estimatedCompleteTime: new Date('2026-04-02T00:00:00Z') },
    { _id: 'order_004', orderNo: 'OR20260328004', storeId, customerId: 'customer_002', frameTemplateId: 'frame_004', frameName: '精选写真集制作', size: 'A5', material: '精装', price: 69.0, status: '已发货', shippingNo: 'SF1234567890', photos: ['https://picsum.photos/400/400?random=211'], createTime: new Date('2026-03-28T16:40:00Z'), estimatedCompleteTime: new Date('2026-04-02T00:00:00Z') },
    { _id: 'order_005', orderNo: 'OR20260310005', storeId, customerId: 'customer_003', frameTemplateId: 'frame_002', frameName: 'AI 古风唯美写真', size: '20cm×20cm', material: '实木工艺', price: 19.9, status: '已完成', shippingNo: 'SF0987654321', photos: ['https://picsum.photos/400/400?random=216'], createTime: new Date('2026-03-10T10:15:00Z'), estimatedCompleteTime: new Date('2026-03-18T00:00:00Z') }
  ]
  for (const o of orders) {
    await db.collection('frame_orders').doc(o._id).set({ data: o }).catch(e => console.error(e))
  }

  // 5. 插入打卡记录
  const checkins = [
    { _id: 'checkin_001', customerId: 'customer_001', storeId, checkinDate: '2026-04-30', createTime: new Date('2026-04-30T09:00:00Z') },
    { _id: 'checkin_002', customerId: 'customer_002', storeId, checkinDate: '2026-04-30', createTime: new Date('2026-04-30T10:30:00Z') },
    { _id: 'checkin_003', customerId: 'customer_001', storeId, checkinDate: '2026-04-29', createTime: new Date('2026-04-29T11:00:00Z') },
    { _id: 'checkin_004', customerId: 'customer_003', storeId, checkinDate: '2026-04-29', createTime: new Date('2026-04-29T14:20:00Z') }
  ]
  for (const c of checkins) {
    await db.collection('checkins').add({ data: c }).catch(e => console.error(e))
  }

  return { success: true, message: '示例数据插入完成，请刷新页面查看' }
}