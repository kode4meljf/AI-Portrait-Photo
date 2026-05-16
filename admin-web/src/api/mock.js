const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms))

const mockStores = [
  {
    _id: 'store_demo_1',
    name: 'AI写真馆·旗舰店',
    contactName: '张店长',
    contactPhone: '13800000001',
    address: '上海市徐汇区',
    level: '黄金会员',
    balance: 1280,
    packageTotal: 100,
    packageUsed: 36
  },
  {
    _id: 'store_demo_2',
    name: 'AI写真馆·浦东店',
    contactName: '李店长',
    contactPhone: '13800000002',
    address: '上海市浦东新区',
    level: '普通会员',
    balance: 560,
    packageTotal: 50,
    packageUsed: 12
  }
]

const mockCustomers = [
  { _id: 'c1', storeId: 'store_demo_1', nickName: '张小明', phone: '13900000001', equityAlbum: 5, equityFrame: 3, totalCheckins: 12 },
  { _id: 'c2', storeId: 'store_demo_1', nickName: '李婷婷', phone: '13900000002', equityAlbum: 8, equityFrame: 5, totalCheckins: 28 }
]

const mockOrders = [
  { _id: 'o1', storeId: 'store_demo_1', orderNo: 'OR20260516001', customerId: 'c1', customerName: '张小明', frameName: '经典木质相框', size: '10寸', material: '实木', price: 199, status: '制作中', createTimeText: '2026-05-16 10:20:00' },
  { _id: 'o2', storeId: 'store_demo_1', orderNo: 'OR20260515002', customerId: 'c2', customerName: '李婷婷', frameName: '简约金属相框', size: '8寸', material: '铝合金', price: 129, status: '待处理', createTimeText: '2026-05-15 16:45:00' }
]

export async function mockRequest(action, payload = {}, query = {}) {
  await delay()
  switch (action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() }
    case 'login':
      if (payload.username === 'admin' && payload.password === 'admin123') {
        return {
          token: 'mock-token-demo',
          expiresIn: 604800000,
          user: { username: 'admin', role: 'admin' }
        }
      }
      throw new Error('用户名或密码错误')
    case 'dashboard':
      return {
        scope: payload.storeId ? 'store' : 'all',
        storeCount: mockStores.length,
        stats: { totalAmount: 3280, frameCount: 18, orderCount: 18, customerCount: 42 },
        checkin: { todayUnchecked: 5 },
        stores: mockStores
      }
    case 'stores.list':
      return { list: mockStores, total: mockStores.length, page: 1, pageSize: 20 }
    case 'stores.get':
      return mockStores.find((s) => s._id === payload.storeId) || mockStores[0]
    case 'stores.update':
      return { ...mockStores[0], ...payload }
    case 'customers.list':
      return { list: mockCustomers, total: mockCustomers.length, page: 1, pageSize: 20 }
    case 'customers.get':
      return mockCustomers.find((c) => c._id === payload.id) || mockCustomers[0]
    case 'customers.update':
      return { ...mockCustomers[0], ...payload }
    case 'orders.list':
      return { list: mockOrders, total: mockOrders.length, page: 1, pageSize: 20 }
    case 'orders.statusCounts':
      return { all: 4, 待处理: 1, 制作中: 2, 已发货: 1, 已完成: 0 }
    case 'orders.updateStatus':
      return { ...mockOrders[0], status: payload.status }
    case 'checkins.list':
      return { date: query.date || '2026-05-16', type: query.type || 'unchecked', total: 1, list: [mockCustomers[1]] }
    case 'checkins.summary':
      return { date: query.date, yesterdayCount: 8, todayCount: 7, todayUnchecked: 3 }
    default:
      throw new Error(`Mock 未实现: ${action}`)
  }
}
