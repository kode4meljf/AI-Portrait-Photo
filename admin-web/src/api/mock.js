import { allocateStyleIdFromList } from '../utils/styleId.js'
import { allocateFrameIdFromList } from '../utils/frameId.js'

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms))

function assertMockUniqueName(list, name, excludeId, resourceLabel) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error(`请填写${resourceLabel}名称`)
  const hit = list.find((row) => (row.name || '').trim() === trimmed && row._id !== excludeId)
  if (hit) {
    const code = hit.id ? `编号 ${hit.id}` : '已有记录'
    throw new Error(`${resourceLabel}名称「${trimmed}」已存在（${code}）`)
  }
}

const mockStores = [
  {
    _id: 'store_demo0001',
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
    _id: 'store_demo0002',
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

const mockAssetAdjustments = []

const mockCustomers = [
  {
    _id: 'c1',
    storeId: 'store_demo0001',
    nickName: '张小明',
    wxNickName: '小明同学',
    phone: '13900000001',
    avatarUrl: '',
    avatarDisplayUrl: '',
    remark: '老客户',
    source: 'link_register',
    wxOpenId: 'wx_mock_1',
    equityAlbum: 5,
    equityFrame: 3,
    totalCheckins: 12,
    createTime: '2026-05-10T10:00:00.000Z',
    displayName: '张小明',
    avatarInitial: '张',
    wxNickNameDisplay: '小明同学',
    showWxNickName: true,
    sourceLabel: '邀请注册',
    registeredLabel: '已注册',
    registered: true,
    remarkDisplay: '老客户',
    createTimeText: '2026/5/10 18:00:00'
  },
  {
    _id: 'c2',
    storeId: 'store_demo0001',
    nickName: '',
    wxNickName: '婷婷',
    phone: '13900000002',
    avatarUrl: '',
    avatarDisplayUrl: '',
    remark: '',
    source: 'store_create',
    wxOpenId: '',
    equityAlbum: 8,
    equityFrame: 5,
    totalCheckins: 28,
    createTime: '2026-05-12T08:30:00.000Z',
    displayName: '婷婷',
    avatarInitial: '婷',
    wxNickNameDisplay: '婷婷',
    showWxNickName: false,
    sourceLabel: '门店建档',
    registeredLabel: '未注册',
    registered: false,
    remarkDisplay: '—',
    createTimeText: '2026/5/12 16:30:00'
  }
]

function withStyleSampleUrl(row) {
  const sampleFileId = row.sampleFileId || ''
  return {
    ...row,
    sampleFileId,
    sampleUrl: sampleFileId && !String(sampleFileId).startsWith('cloud://') ? sampleFileId : row.sampleUrl || ''
  }
}

const mockStyles = [
  { _id: 't1', id: 'S01', name: '机长照', prompt: 'professional airline pilot portrait, studio lighting, crisp uniform, confident expression', sampleFileId: '/assets/templates/simple.jpg', sort: 10, enabled: true },
  { _id: 't2', id: 'S02', name: '港风街拍', prompt: 'Hong Kong street fashion portrait, neon city bokeh, cinematic mood', sampleFileId: '/assets/templates/flower.jpg', sort: 20, enabled: true },
  { _id: 't3', id: 'S03', name: '法式复古', prompt: 'French vintage portrait, soft film tone, elegant retro outfit', sampleFileId: '/assets/templates/hanfu.jpg', sort: 30, enabled: true },
  { _id: 't4', id: 'S04', name: '清冷韩系', prompt: 'Korean minimalist portrait, cool tone, clean makeup, airy background', sampleFileId: '/assets/templates/simple.jpg', sort: 40, enabled: true },
  { _id: 't5', id: 'S05', name: '日系通勤', prompt: 'Japanese daily commute portrait, natural light, subtle grain', sampleFileId: '/assets/templates/flower.jpg', sort: 50, enabled: true },
  { _id: 't6', id: 'S06', name: '胶片人像', prompt: 'film photography portrait, warm grain, analog color', sampleFileId: '/assets/templates/hanfu.jpg', sort: 60, enabled: true },
  { _id: 't7', id: 'S07', name: '新中式写真', prompt: 'modern Chinese aesthetic portrait, hanfu elements, soft ink-wash mood', sampleFileId: '/assets/templates/simple.jpg', sort: 70, enabled: true },
  { _id: 't8', id: 'S08', name: '轻奢证件照', prompt: 'premium ID photo portrait, even lighting, neat hairstyle, neutral background', sampleFileId: '/assets/templates/flower.jpg', sort: 80, enabled: true },
  { _id: 't9', id: 'S09', name: '电影质感', prompt: 'cinematic portrait, dramatic lighting, shallow depth of field', sampleFileId: '/assets/templates/hanfu.jpg', sort: 90, enabled: true }
].map(withStyleSampleUrl)

const mockFrames = [
  { _id: 'f1', id: 'F01', name: '原木火烈鸟', coverFileId: '/assets/frames/frame-f01-flamingo.png', coverUrl: '/assets/frames/frame-f01-flamingo.png', sizeAxis: 'lw', sizeFirst: 20, sizeSecond: 25, sizeUnit: 'cm', size: '20cm × 25cm', material: '原木', sort: 10, enabled: true },
  { _id: 'f2', id: 'F02', name: '黑色小羊', coverFileId: '/assets/frames/frame-f02-sheep.png', coverUrl: '/assets/frames/frame-f02-sheep.png', sizeAxis: 'lw', sizeFirst: 20, sizeSecond: 25, sizeUnit: 'cm', size: '20cm × 25cm', material: '金属', sort: 20, enabled: true },
  { _id: 'f3', id: 'F03', name: '简约婚纱', coverFileId: '/assets/frames/frame-f03-wedding.png', coverUrl: '/assets/frames/frame-f03-wedding.png', sizeAxis: 'lw', sizeFirst: 20, sizeSecond: 30, sizeUnit: 'cm', size: '20cm × 30cm', material: '亚克力', sort: 30, enabled: true }
]

let mockPlatformSettings = {
  _id: 'default',
  supportPhone: '400-888-8888',
  updateTime: new Date().toISOString()
}

const mockFeedbacks = [
  {
    _id: 'fb1',
    sourceRole: 'customer',
    sourceRoleLabel: '顾客',
    content: '打卡码刷新有点慢，希望优化一下。',
    contact: 'wx: demo_user',
    submitterName: '张小明',
    submitterPhone: '13900000001',
    storeId: 'store_demo0001',
    storeName: 'AI写真馆·旗舰店',
    status: 'pending',
    createTimeText: '2026-05-18 14:20'
  },
  {
    _id: 'fb2',
    sourceRole: 'store',
    sourceRoleLabel: '门店',
    content: '订单列表下拉刷新偶尔会失败。',
    contact: '',
    submitterName: '张店长',
    submitterPhone: '13800000001',
    storeId: 'store_demo0001',
    storeName: 'AI写真馆·旗舰店',
    status: 'read',
    createTimeText: '2026-05-17 09:10'
  }
]

const mockOrders = [
  { _id: 'o1', storeId: 'store_demo0001', orderNo: 'OR20260516001', customerId: 'c1', customerName: '张小明', frameName: '经典木质相框', size: '10寸', material: '实木', price: 199, status: '制作中', createTimeText: '2026-05-16 10:20:00' },
  { _id: 'o2', storeId: 'store_demo0001', orderNo: 'OR20260515002', customerId: 'c2', customerName: '李婷婷', frameName: '简约金属相框', size: '8寸', material: '铝合金', price: 129, status: '待处理', createTimeText: '2026-05-15 16:45:00' }
]

export async function mockRequest(action, payload = {}, query = {}) {
  await delay()
  switch (action) {
    case 'ping':
      return { pong: true, time: new Date().toISOString() }
    case 'login': {
      const mockAccounts = [
        { username: 'admin', password: 'admin123' },
        { username: 'audit', password: 'audit123' }
      ]
      const matched = mockAccounts.find(
        (a) => a.username === payload.username && a.password === payload.password
      )
      if (!matched) throw new Error('用户名或密码错误')
      return {
        token: `mock-token-${matched.username}`,
        expiresIn: 604800000,
        user: { username: matched.username, role: 'admin' }
      }
    }
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
    case 'stores.update': {
      const idx = mockStores.findIndex((s) => s._id === payload._id)
      const base = idx >= 0 ? mockStores[idx] : mockStores[0]
      if (
        payload.balance !== undefined ||
        payload.packageTotal !== undefined ||
        payload.packageUsed !== undefined
      ) {
        throw new Error('账户余额与套餐须通过「调整资产」并完成短信验证')
      }
      const next = { ...base, ...payload }
      if (idx >= 0) mockStores[idx] = next
      return next
    }
    case 'stores.assetAdjust.sendCode':
      return { phoneMasked: '138****0000', expireIn: 300, mock: true }
    case 'stores.assetAdjust.apply': {
      const store = mockStores.find((s) => s._id === payload.storeId) || mockStores[0]
      if (String(payload.smsCode || '').trim() !== '123456') {
        throw new Error('验证码错误或已过期')
      }
      const changes = {}
      ;['balance', 'packageTotal', 'packageUsed'].forEach((key) => {
        if (payload[key] === undefined) return
        const after = Number(payload[key]) || 0
        const before = Number(store[key]) || 0
        if (after !== before) changes[key] = { before, after }
      })
      if (!Object.keys(changes).length) throw new Error('资产数值与当前一致，无需调整')
      const reason = String(payload.reason || '').trim()
      if (reason.length < 4) throw new Error('请填写调整原因（至少 4 个字）')
      Object.keys(changes).forEach((k) => {
        store[k] = changes[k].after
      })
      const now = new Date().toISOString()
      const row = {
        _id: `adj_${Date.now()}`,
        storeId: store._id,
        storeName: store.name,
        status: 'approved',
        changes,
        changeSummary: Object.keys(changes)
          .map((k) => `${k} ${changes[k].before} → ${changes[k].after}`)
          .join('；'),
        reason,
        requestedBy: 'admin',
        applyTime: now,
        createTime: now
      }
      mockAssetAdjustments.unshift(row)
      return { adjustment: row, store: { ...store } }
    }
    case 'stores.assetAdjust.list': {
      let rows = mockAssetAdjustments.slice()
      if (query.storeId) rows = rows.filter((r) => r.storeId === query.storeId)
      if (query.status) rows = rows.filter((r) => r.status === query.status)
      return { list: rows, total: rows.length, page: 1, pageSize: 20 }
    }
    case 'customers.list':
      return { list: mockCustomers, total: mockCustomers.length, page: 1, pageSize: 20 }
    case 'customers.get':
      return mockCustomers.find((c) => c._id === payload.id) || mockCustomers[0]
    case 'customers.uploadAvatar': {
      const row = mockCustomers.find((c) => c._id === payload.id) || mockCustomers[0]
      const fakeId = `cloud://mock/avatar/${row._id}.jpg`
      return { avatarUrl: fakeId, avatarDisplayUrl: '' }
    }
    case 'customers.update': {
      const idx = mockCustomers.findIndex((c) => c._id === (payload.id || payload._id))
      if (idx < 0) return { ...mockCustomers[0], ...payload }
      const next = { ...mockCustomers[idx], ...payload }
      if (payload.avatarUrl === '') {
        next.avatarDisplayUrl = ''
      }
      mockCustomers[idx] = next
      return next
    }
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
    case 'styles.list': {
      const keyword = (query.keyword || payload.keyword || '').trim().toLowerCase()
      let rows = mockStyles.slice().sort((a, b) => {
        const na = Number(String(a.id).replace(/^S/i, '')) || 999
        const nb = Number(String(b.id).replace(/^S/i, '')) || 999
        return na - nb
      })
      if (keyword) {
        rows = rows.filter(
          (s) => s.name.toLowerCase().includes(keyword) || s.id.toLowerCase().includes(keyword)
        )
      }
      return {
        list: rows.map(withStyleSampleUrl),
        total: rows.length,
        enabledCount: mockStyles.filter((s) => s.enabled !== false).length,
        page: 1,
        pageSize: 20
      }
    }
    case 'styles.get': {
      const row = mockStyles.find((s) => s._id === payload._id || s.id === payload.id) || mockStyles[0]
      return withStyleSampleUrl(row)
    }
    case 'styles.create': {
      assertMockUniqueName(mockStyles, payload.name, null, '风格')
      const row = withStyleSampleUrl({
        _id: `t${Date.now()}`,
        id: allocateStyleIdFromList(mockStyles),
        name: (payload.name || '').trim(),
        prompt: payload.prompt || '',
        sampleFileId: payload.sampleFileId || '',
        sort: payload.sort || 0,
        enabled: payload.enabled !== false
      })
      mockStyles.push(row)
      return row
    }
    case 'styles.uploadSample': {
      const dataUrl = `data:image/jpeg;base64,${payload.base64 || ''}`
      const sampleFileId = `mock-style-${Date.now()}`
      return { sampleFileId, sampleUrl: dataUrl }
    }
    case 'styles.update': {
      const idx = mockStyles.findIndex((s) => s._id === payload._id)
      if (idx < 0) throw new Error('风格不存在')
      if (payload.name !== undefined) {
        assertMockUniqueName(mockStyles, payload.name, payload._id, '风格')
        payload.name = (payload.name || '').trim()
      }
      mockStyles[idx] = { ...mockStyles[idx], ...payload }
      return mockStyles[idx]
    }
    case 'styles.delete': {
      const idx = mockStyles.findIndex((s) => s._id === payload._id)
      if (idx >= 0) mockStyles.splice(idx, 1)
      return { deleted: true }
    }
    case 'frames.uploadCover': {
      const dataUrl = `data:image/jpeg;base64,${payload.base64 || ''}`
      const coverFileId = `mock-frame-${Date.now()}`
      return { coverFileId, coverUrl: dataUrl }
    }
    case 'frames.list': {
      const keyword = (query.keyword || payload.keyword || '').trim().toLowerCase()
      let rows = mockFrames.slice().sort((a, b) => {
        const na = Number(String(a.id).replace(/^F/i, '')) || 999
        const nb = Number(String(b.id).replace(/^F/i, '')) || 999
        return na - nb
      })
      if (keyword) {
        rows = rows.filter(
          (s) => s.name.toLowerCase().includes(keyword) || s.id.toLowerCase().includes(keyword)
        )
      }
      return {
        list: rows.map((row) => ({
          ...row,
          coverFileId: row.coverFileId || '',
          coverUrl: row.coverUrl || row.coverFileId || ''
        })),
        total: rows.length,
        enabledCount: mockFrames.filter((s) => s.enabled !== false).length,
        page: 1,
        pageSize: 20
      }
    }
    case 'frames.get':
      return mockFrames.find((s) => s._id === payload._id || s.id === payload.id) || mockFrames[0]
    case 'frames.create': {
      assertMockUniqueName(mockFrames, payload.name, null, '相框')
      const row = {
        _id: `f${Date.now()}`,
        id: allocateFrameIdFromList(mockFrames),
        name: (payload.name || '').trim(),
        coverFileId: payload.coverFileId || '',
        sizeAxis: 'lw',
        sizeFirst: payload.sizeFirst ?? null,
        sizeSecond: payload.sizeSecond ?? null,
        sizeUnit: payload.sizeUnit || 'cm',
        size: payload.size || '',
        material: payload.material || '',
        sort: payload.sort || 0,
        enabled: payload.enabled !== false
      }
      mockFrames.push(row)
      return row
    }
    case 'frames.update': {
      const idx = mockFrames.findIndex((s) => s._id === payload._id)
      if (idx < 0) throw new Error('相框不存在')
      if (payload.name !== undefined) {
        assertMockUniqueName(mockFrames, payload.name, payload._id, '相框')
        payload.name = (payload.name || '').trim()
      }
      mockFrames[idx] = { ...mockFrames[idx], ...payload }
      return mockFrames[idx]
    }
    case 'frames.delete': {
      const idx = mockFrames.findIndex((s) => s._id === payload._id)
      if (idx >= 0) mockFrames.splice(idx, 1)
      return { deleted: true }
    }
    case 'platformSettings.get':
      return { ...mockPlatformSettings }
    case 'platformSettings.update': {
      mockPlatformSettings = {
        _id: 'default',
        supportPhone: (payload.supportPhone || '').trim(),
        updateTime: new Date().toISOString()
      }
      return { ...mockPlatformSettings }
    }
    case 'feedbacks.list': {
      let rows = [...mockFeedbacks]
      const sourceRole = (query.sourceRole || '').trim()
      const status = (query.status || '').trim()
      const keyword = (query.keyword || '').trim().toLowerCase()
      if (sourceRole) rows = rows.filter((r) => r.sourceRole === sourceRole)
      if (status) rows = rows.filter((r) => r.status === status)
      if (keyword) {
        rows = rows.filter((r) =>
          [r.content, r.submitterName, r.submitterPhone, r.contact, r.storeName]
            .join(' ')
            .toLowerCase()
            .includes(keyword)
        )
      }
      const page = Math.max(1, parseInt(query.page, 10) || 1)
      const pageSize = Math.max(1, parseInt(query.pageSize, 10) || 20)
      const skip = (page - 1) * pageSize
      return {
        list: rows.slice(skip, skip + pageSize),
        total: rows.length,
        page,
        pageSize
      }
    }
    case 'feedbacks.updateStatus': {
      const idx = mockFeedbacks.findIndex((r) => r._id === payload._id)
      if (idx < 0) throw new Error('反馈不存在')
      mockFeedbacks[idx] = { ...mockFeedbacks[idx], status: payload.status }
      return { ...mockFeedbacks[idx] }
    }
    case 'feedbacks.delete': {
      const idx = mockFeedbacks.findIndex((r) => r._id === payload._id)
      if (idx < 0) throw new Error('反馈不存在')
      mockFeedbacks.splice(idx, 1)
      return { _id: payload._id }
    }
    default:
      throw new Error(`Mock 未实现: ${action}`)
  }
}
