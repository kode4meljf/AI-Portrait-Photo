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

function assertMockStyleNameUnique(list, name, gender, excludeId) {
  const trimmed = (name || '').trim()
  if (!trimmed) throw new Error('请填写风格名称')
  const g = normalizeMockStyleGender(gender)
  const hit = list.find(
    (row) =>
      (row.name || '').trim() === trimmed &&
      normalizeMockStyleGender(row.gender) === g &&
      row._id !== excludeId
  )
  if (hit) {
    const code = hit.id ? `编号 ${hit.id}` : '已有记录'
    throw new Error(`该性别下风格名称「${trimmed}」已存在（${code}）`)
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

function normalizeMockStyleGender(value) {
  const s = String(value || '').trim()
  if (s === '女' || s === 'female') return '女'
  return '男'
}

function withStyleSampleUrl(row) {
  const sampleFileId = row.sampleFileId || ''
  const sampleHdFileId = row.sampleHdFileId || ''
  return {
    ...row,
    resolution: row.resolution || '1536:1152',
    gender: normalizeMockStyleGender(row.gender),
    sampleFileId,
    sampleUrl: sampleFileId && !String(sampleFileId).startsWith('cloud://') ? sampleFileId : row.sampleUrl || '',
    sampleHdFileId,
    sampleHdUrl:
      sampleHdFileId && !String(sampleHdFileId).startsWith('cloud://')
        ? sampleHdFileId
        : row.sampleHdUrl || ''
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
  volcAccessKeyMasked: '',
  volcSecretKeyConfigured: false,
  volcKeysUpdateTime: null,
  portraitEngine: 'jimeng',
  portraitEngineLabel: '经典引擎',
  portraitEngineOptions: [
    { value: 'jimeng', label: '经典引擎', engineId: 'i2i_portrait_photo', description: '即梦人像写真，稳定人像保真' },
    { value: 'seedream', label: '智绘引擎', description: '豆包 Seedream，多模态生图' }
  ],
  arkApiKeyMasked: '',
  arkApiKeyConfigured: false,
  arkKeysUpdateTime: null,
  seedreamModelId: 'doubao-seedream-5-0-260128',
  seedreamSizeTier: '2k',
  seedreamOrientation: 'portrait',
  seedreamOutputSizeLabel: '1728 × 2304',
  jimengMaxConcurrency: 1,
  seedreamMaxConcurrency: 10,
  albumEntryMinTotal: 40,
  albumSelectMin: 30,
  albumSelectMax: 40,
  albumPointsPerPhoto: 23,
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
  {
    _id: 'o1',
    storeId: 'store_demo0001',
    orderNo: 'OR20260516001',
    orderType: 'frame',
    orderTypeLabel: '摆台',
    customerId: 'c1',
    customerName: '张小明',
    customerPhone: '13800000001',
    frameName: '经典木质相框',
    frameCode: 'F01',
    productName: '经典木质相框',
    size: '20cm × 25cm',
    material: '实木',
    price: '-',
    status: '制作中',
    shippingNo: '',
    createTimeText: '2026-05-16 10:20:00',
    exportedAtText: ''
  },
  {
    _id: 'o2',
    storeId: 'store_demo0001',
    orderNo: 'OR20260515002',
    orderType: 'frame',
    orderTypeLabel: '摆台',
    customerId: 'c2',
    customerName: '李婷婷',
    customerPhone: '13800000002',
    frameName: '简约金属相框',
    frameCode: 'F02',
    productName: '简约金属相框',
    size: '20cm × 25cm',
    material: '铝合金',
    price: '-',
    status: '待处理',
    shippingNo: '',
    createTimeText: '2026-05-15 16:45:00',
    exportedAtText: ''
  },
  {
    _id: 'o3',
    storeId: 'store_demo0001',
    orderNo: 'AL20260514001',
    orderType: 'album',
    orderTypeLabel: '影集',
    customerId: 'c1',
    customerName: '张小明',
    customerPhone: '13800000001',
    productName: '写真集',
    frameName: '写真集',
    size: '-',
    material: '-',
    photoCount: 9,
    price: '207积分',
    status: '待处理',
    shippingNo: '',
    createTimeText: '2026-05-14 11:00:00',
    exportedAtText: ''
  }
]

const mockRechargePackages = [
  {
    _id: 'pkg1',
    id: 1,
    name: '散单·体验',
    points: 30,
    times: 30,
    price: 3,
    originalPrice: 3,
    tag: '1人9张',
    expireDays: 365,
    sort: 10,
    enabled: true,
    updateTimeText: '2026-05-18 10:00'
  },
  {
    _id: 'pkg2',
    id: 2,
    name: '散单·小包',
    points: 280,
    times: 280,
    price: 28,
    originalPrice: 30,
    tag: '约10人',
    expireDays: 365,
    sort: 20,
    enabled: true,
    updateTimeText: '2026-05-18 10:00'
  }
]

const mockGalleryBatches = [
  {
    _id: 'batch_demo1',
    storeId: 'store_demo0001',
    customerId: 'c1',
    customerName: '张小明',
    createTimeText: '2026-05-18 15:30',
    status: 'completed',
    statusLabel: '已完成',
    photoCount: 3,
    generatedCount: 3,
    progressPercent: 100,
    coverUrl: '',
    styleSummary: '日系清新 · 复古胶片'
  }
]

function maskExportPhone(phone) {
  const p = String(phone || '').trim().replace(/\s/g, '')
  if (!p) return '-'
  if (p.length >= 11) return `${p.slice(0, 3)}****${p.slice(-4)}`
  if (p.length >= 7) return `${p.slice(0, 2)}****${p.slice(-2)}`
  return '****'
}

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
        stores: mockStores,
        portraitGenerateStats: {
          applicable: true,
          sizeTier: '2k',
          sizeTierLabel: '2K',
          sampleCount: 12,
          avgGenerateMs: 38200,
          insufficient: false
        }
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
        throw new Error('账户积分与充值记录须通过「调整资产」并完成短信验证')
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
      return { all: mockOrders.length, 待处理: 2, 制作中: 1, 已发货: 0, 已完成: 0 }
    case 'orders.updateStatus': {
      const idx = mockOrders.findIndex((o) => o._id === payload.orderId)
      if (idx >= 0) {
        mockOrders[idx] = { ...mockOrders[idx], status: payload.status }
        if (payload.shippingNo !== undefined) mockOrders[idx].shippingNo = payload.shippingNo
      }
      return mockOrders[idx] || { status: payload.status }
    }
    case 'orders.updateShipping': {
      const idx = mockOrders.findIndex((o) => o._id === payload.orderId)
      if (idx >= 0) mockOrders[idx].shippingNo = payload.shippingNo || ''
      return mockOrders[idx] || { shippingNo: payload.shippingNo || '' }
    }
    case 'orders.batchDelete': {
      const ids = new Set((payload.items || []).map((i) => i.orderId))
      const before = mockOrders.length
      for (let i = mockOrders.length - 1; i >= 0; i -= 1) {
        if (ids.has(mockOrders[i]._id)) mockOrders.splice(i, 1)
      }
      return { deletedCount: before - mockOrders.length, failed: [], results: [] }
    }
    case 'orders.export': {
      const ids = new Set((payload.items || []).map((i) => i.orderId))
      const picked = mockOrders.filter((o) => ids.has(o._id))
      const exportable = picked.filter((o) => ['待处理', '制作中'].includes(o.status))
      exportable.forEach((o) => {
        o.exportedAtText = new Date().toLocaleString('zh-CN')
        if (o.status === '待处理') o.status = '制作中'
      })
      const frameRows = exportable
        .filter((o) => o.orderType === 'frame')
        .map((o) => ({
          orderNo: o.orderNo,
          frameCode: o.frameCode || 'F01',
          frameName: o.frameName,
          material: o.material,
          size: o.size,
          customerName: o.customerName,
          customerPhone: maskExportPhone(o.customerPhone),
          imageFileName: `${o.orderNo}.jpg`
        }))
      const albumRows = exportable
        .filter((o) => o.orderType === 'album')
        .map((o) => ({
          orderNo: o.orderNo,
          customerName: o.customerName,
          customerPhone: maskExportPhone(o.customerPhone),
          photoCount: o.photoCount || 0,
          folderName: `${o.orderNo}_${o.customerName}`
        }))
      return {
        exportedCount: exportable.length,
        skipped: picked.filter((o) => !['待处理', '制作中'].includes(o.status)),
        frame: {
          rows: frameRows,
          images: frameRows.map((r) => ({
            fileName: r.imageFileName,
            downloadUrl: '/assets/frames/frame-f01-flamingo.png'
          }))
        },
        album: {
          rows: albumRows,
          folders: albumRows.map((r) => ({
            folderName: r.folderName,
            files: [{ fileName: '01.jpg', downloadUrl: '/assets/frames/frame-f01-flamingo.png' }]
          }))
        }
      }
    }
    case 'orders.exportImage': {
      const res = await fetch('/assets/frames/frame-f01-flamingo.png')
      if (!res.ok) throw new Error('mock 图片加载失败')
      const blob = await res.blob()
      const buffer = await blob.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i])
      }
      return {
        mimeType: blob.type || 'image/png',
        base64: btoa(binary),
        byteSize: bytes.length
      }
    }
    case 'orders.delete': {
      const idx = mockOrders.findIndex((o) => o._id === (payload.orderId || payload._id))
      if (idx >= 0) mockOrders.splice(idx, 1)
      return {
        orderId: payload.orderId || payload._id,
        deleted: true,
        deletedPortraitFiles: 1,
        clearedPhotos: 0,
        deletedTasks: 0
      }
    }
    case 'checkins.list':
      return { date: query.date || '2026-05-16', type: query.type || 'unchecked', total: 1, list: [mockCustomers[1]] }
    case 'checkins.summary':
      return { date: query.date, yesterdayCount: 8, todayCount: 7, todayUnchecked: 3 }
    case 'styles.list': {
      const keyword = (query.keyword || payload.keyword || '').trim().toLowerCase()
      const genderFilter = String(query.gender || payload.gender || '').trim()
      let rows = mockStyles.slice().sort((a, b) => {
        const na = Number(String(a.id).replace(/^S/i, '')) || 999
        const nb = Number(String(b.id).replace(/^S/i, '')) || 999
        return na - nb
      })
      if (genderFilter === '男' || genderFilter === '女') {
        rows = rows.filter((s) => normalizeMockStyleGender(s.gender) === genderFilter)
      }
      if (keyword) {
        rows = rows.filter(
          (s) => s.name.toLowerCase().includes(keyword) || s.id.toLowerCase().includes(keyword)
        )
      }
      return {
        list: rows.map(withStyleSampleUrl),
        total: rows.length,
        enabledCount: rows.filter((s) => s.enabled !== false).length,
        page: 1,
        pageSize: 20
      }
    }
    case 'styles.get': {
      const row = mockStyles.find((s) => s._id === payload._id || s.id === payload.id) || mockStyles[0]
      return withStyleSampleUrl(row)
    }
    case 'styles.create': {
      const gender = normalizeMockStyleGender(payload.gender)
      assertMockStyleNameUnique(mockStyles, payload.name, gender, null)
      const id =
        (payload.id && String(payload.id).trim().toUpperCase()) ||
        allocateStyleIdFromList(mockStyles, gender)
      const row = withStyleSampleUrl({
        _id: `t${Date.now()}`,
        id,
        name: (payload.name || '').trim(),
        prompt: payload.prompt || '',
        resolution: payload.resolution || '1536:1152',
        gender: normalizeMockStyleGender(payload.gender),
        sampleFileId: payload.sampleFileId || '',
        sampleHdFileId: payload.sampleHdFileId || '',
        sort: payload.sort || 0,
        enabled: payload.enabled !== false
      })
      mockStyles.push(row)
      return row
    }
    case 'styles.prepareSampleUpload': {
      const kind = String(payload.kind || 'thumb').toLowerCase()
      const ts = Date.now()
      const cloudPath =
        kind === 'hd'
          ? `admin/style-templates/hd/mock-${ts}.jpg`
          : `admin/style-templates/mock-${ts}.jpg`
      const fileId =
        kind === 'hd' ? `mock-style-hd-${ts}` : `mock-style-${ts}`
      return {
        kind,
        cloudPath,
        uploadUrl: 'https://mock-upload.local/put',
        authorization: 'mock-signature',
        token: 'mock-token',
        cosFileId: 'mock-cos-file-id',
        fileId
      }
    }
    case 'styles.uploadSample': {
      const ts = Date.now()
      const out = { sampleFileId: '', sampleUrl: '', sampleHdFileId: '', sampleHdUrl: '' }
      if (payload.base64 && String(payload.base64).trim()) {
        out.sampleFileId = `mock-style-${ts}`
        out.sampleUrl = `data:image/jpeg;base64,${payload.base64}`
      } else if (payload.sampleFileId) {
        out.sampleFileId = payload.sampleFileId
        out.sampleUrl = `https://mock.local/${payload.sampleFileId}`
      }
      if (payload.hdBase64 && String(payload.hdBase64).trim()) {
        out.sampleHdFileId = `mock-style-hd-${ts}`
        out.sampleHdUrl = `data:image/jpeg;base64,${payload.hdBase64}`
      } else if (payload.sampleHdFileId) {
        out.sampleHdFileId = payload.sampleHdFileId
        out.sampleHdUrl = `https://mock.local/${payload.sampleHdFileId}`
      }
      if (!out.sampleFileId && !out.sampleHdFileId) throw new Error('缺少图片数据')
      return out
    }
    case 'styles.fetchSampleImage': {
      const fileId = String(payload.fileId || payload.sampleHdFileId || '').trim()
      const row = mockStyles.find(
        (s) => s.sampleHdFileId === fileId || s.sampleFileId === fileId
      )
      const url = row && (row.sampleHdUrl || row.sampleUrl)
      if (!url || !String(url).startsWith('data:')) {
        throw new Error('mock 无可用样图')
      }
      const m = url.match(/^data:([^;]+);base64,(.+)$/)
      if (!m) throw new Error('mock 样图格式无效')
      return { mimeType: m[1], base64: m[2], byteSize: m[2].length }
    }
    case 'styles.generateSample': {
      const prompt = String(payload.prompt || '').trim()
      if (!prompt) throw new Error('请先填写提示词')
      const row = mockStyles.find((s) => s.sampleHdUrl && String(s.sampleHdUrl).startsWith('data:'))
      if (!row) throw new Error('mock 无可用样图')
      const m = String(row.sampleHdUrl).match(/^data:([^;]+);base64,(.+)$/)
      if (!m) throw new Error('mock 样图格式无效')
      const ts = Date.now()
      return {
        sampleHdFileId: `mock-style-hd-${ts}`,
        sampleHdUrl: row.sampleHdUrl,
        byteSize: m[2].length,
        reportedSize: '1728x2304',
        promptPreview: `${prompt.slice(0, 80)}…`
      }
    }
    case 'styles.discardSamples': {
      const ids = Array.isArray(payload.fileIds) ? payload.fileIds : []
      return { deleted: ids.length, skipped: 0, requested: ids.length }
    }
    case 'styles.update': {
      const idx = mockStyles.findIndex((s) => s._id === payload._id)
      if (idx < 0) throw new Error('风格不存在')
      if (payload.name !== undefined) {
        const row = mockStyles[idx]
        const gender =
          payload.gender !== undefined
            ? normalizeMockStyleGender(payload.gender)
            : normalizeMockStyleGender(row.gender)
        assertMockStyleNameUnique(mockStyles, payload.name, gender, payload._id)
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
    case 'platformSettings.get': {
      const savedJimeng = mockPlatformSettings.jimengMaxConcurrency ?? 1
      const savedSeedream = mockPlatformSettings.seedreamMaxConcurrency ?? 10
      return {
        ...mockPlatformSettings,
        jimengMaxConcurrency: savedJimeng,
        jimengMaxConcurrencyEffective: savedJimeng,
        jimengMaxConcurrencyOverriddenByEnv: false,
        seedreamMaxConcurrency: savedSeedream,
        seedreamMaxConcurrencyEffective: savedSeedream,
        seedreamMaxConcurrencyOverriddenByEnv: false
      }
    }
    case 'platformSettings.update': {
      const volcAccessKey = (payload.volcAccessKey || '').trim()
      const volcSecretKey = (payload.volcSecretKey || '').trim()
      const arkApiKey = (payload.arkApiKey || '').trim()
      const portraitEngine = (payload.portraitEngine || 'jimeng').trim() === 'seedream' ? 'seedream' : 'jimeng'
      const nextArkConfigured = !!arkApiKey || mockPlatformSettings.arkApiKeyConfigured
      if (portraitEngine === 'seedream' && !nextArkConfigured) {
        throw new Error('选择智绘引擎前，请先配置方舟 API Key')
      }
      const savedJimeng = Math.min(
        10,
        Math.max(1, Math.floor(Number(payload.jimengMaxConcurrency) || 1))
      )
      const savedSeedream = Math.min(
        50,
        Math.max(1, Math.floor(Number(payload.seedreamMaxConcurrency) || 10))
      )
      const albumSelectMin = Math.min(
        200,
        Math.max(1, Math.floor(Number(payload.albumSelectMin) || 30))
      )
      let albumSelectMax = Math.min(
        200,
        Math.max(albumSelectMin, Math.floor(Number(payload.albumSelectMax) || 40))
      )
      const albumEntryMinTotal = Math.min(
        500,
        Math.max(albumSelectMax, Math.floor(Number(payload.albumEntryMinTotal) || 40))
      )
      const albumPointsPerPhoto = Math.min(
        999,
        Math.max(1, Math.floor(Number(payload.albumPointsPerPhoto) || 23))
      )
      mockPlatformSettings = {
        ...mockPlatformSettings,
        supportPhone: (payload.supportPhone || '').trim(),
        portraitEngine,
        portraitEngineLabel: portraitEngine === 'seedream' ? '智绘引擎' : '经典引擎',
        seedreamModelId: (payload.seedreamModelId || 'doubao-seedream-5-0-260128').trim(),
        seedreamSizeTier: (payload.seedreamSizeTier || '2k').trim() === '4k' ? '4k' : '2k',
        seedreamOrientation: (() => {
          const o = String(payload.seedreamOrientation || 'portrait').trim().toLowerCase()
          if (o === 'landscape' || o === '横图') return 'landscape'
          if (o === 'auto' || o === '自动') return 'auto'
          return 'portrait'
        })(),
        jimengMaxConcurrency: savedJimeng,
        seedreamMaxConcurrency: savedSeedream,
        albumSelectMin,
        albumSelectMax,
        albumEntryMinTotal,
        albumPointsPerPhoto,
        updateTime: new Date().toISOString()
      }
      if (volcAccessKey) {
        mockPlatformSettings.volcAccessKeyMasked =
          volcAccessKey.length <= 8
            ? '****'
            : `${volcAccessKey.slice(0, 4)}****${volcAccessKey.slice(-4)}`
      }
      if (volcSecretKey) {
        mockPlatformSettings.volcSecretKeyConfigured = true
        mockPlatformSettings.volcKeysUpdateTime = new Date().toISOString()
      }
      if (arkApiKey) {
        mockPlatformSettings.arkApiKeyMasked =
          arkApiKey.length <= 8
            ? '****'
            : `${arkApiKey.slice(0, 4)}****${arkApiKey.slice(-4)}`
        mockPlatformSettings.arkApiKeyConfigured = true
        mockPlatformSettings.arkKeysUpdateTime = new Date().toISOString()
      }
      return {
        ...mockPlatformSettings,
        jimengMaxConcurrencyEffective: mockPlatformSettings.jimengMaxConcurrency,
        jimengMaxConcurrencyOverriddenByEnv: false,
        seedreamMaxConcurrencyEffective: mockPlatformSettings.seedreamMaxConcurrency,
        seedreamMaxConcurrencyOverriddenByEnv: false
      }
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
    case 'gallery.batches.list': {
      const storeId = (query.storeId || '').trim()
      if (!storeId) throw new Error('请先在后台选择门店')
      const page = Math.max(1, parseInt(query.page, 10) || 1)
      const pageSize = Math.max(1, parseInt(query.pageSize, 10) || 20)
      const rows = mockGalleryBatches.filter((r) => r.storeId === storeId)
      const skip = (page - 1) * pageSize
      return { list: rows.slice(skip, skip + pageSize), total: rows.length, page, pageSize }
    }
    case 'gallery.batches.get': {
      const batch = mockGalleryBatches.find((r) => r._id === payload.batchId)
      if (!batch) throw new Error('批次不存在')
      return {
        batch,
        photos: [
          {
            _id: 'ph1',
            styleName: '日系清新',
            originalDisplayUrl: '',
            aiDisplayUrl: '',
            generateStatus: 'completed'
          }
        ]
      }
    }
    case 'gallery.batches.delete': {
      const idx = mockGalleryBatches.findIndex((r) => r._id === payload.batchId)
      if (idx < 0) throw new Error('批次不存在')
      mockGalleryBatches.splice(idx, 1)
      return { batchId: payload.batchId, deletedPhotos: 1, deletedTasks: 1, deletedFiles: 2 }
    }
    case 'gallery.batches.batchDelete': {
      const ids = new Set((payload.items || []).map((i) => i.batchId || i._id))
      const before = mockGalleryBatches.length
      for (let i = mockGalleryBatches.length - 1; i >= 0; i -= 1) {
        if (ids.has(mockGalleryBatches[i]._id)) mockGalleryBatches.splice(i, 1)
      }
      return { deletedCount: before - mockGalleryBatches.length, failed: [], results: [] }
    }
    case 'rechargePackages.list': {
      const keyword = (query.keyword || '').trim().toLowerCase()
      let rows = [...mockRechargePackages]
      if (keyword) {
        rows = rows.filter((r) =>
          [r.name, r.tag, String(r.id)].join(' ').toLowerCase().includes(keyword)
        )
      }
      const page = Math.max(1, parseInt(query.page, 10) || 1)
      const pageSize = Math.max(1, parseInt(query.pageSize, 10) || 20)
      const skip = (page - 1) * pageSize
      return {
        list: rows.slice(skip, skip + pageSize),
        total: rows.length,
        page,
        pageSize,
        enabledCount: rows.filter((r) => r.enabled !== false).length
      }
    }
    case 'rechargePackages.get': {
      const row = mockRechargePackages.find((r) => r._id === payload._id)
      if (!row) throw new Error('套餐不存在')
      return { ...row }
    }
    case 'rechargePackages.create': {
      const id = mockRechargePackages.length
        ? Math.max(...mockRechargePackages.map((r) => r.id)) + 1
        : 1
      const points = payload.points != null ? payload.points : payload.times
      const row = {
        _id: `pkg${Date.now()}`,
        id,
        name: payload.name,
        points,
        times: points,
        price: payload.price,
        originalPrice: payload.originalPrice,
        tag: payload.tag || '',
        expireDays: payload.expireDays || 365,
        sort: payload.sort || 0,
        enabled: payload.enabled !== false,
        updateTimeText: new Date().toLocaleString('zh-CN')
      }
      mockRechargePackages.push(row)
      return row
    }
    case 'rechargePackages.update': {
      const idx = mockRechargePackages.findIndex((r) => r._id === payload._id)
      if (idx < 0) throw new Error('套餐不存在')
      const points = payload.points != null ? payload.points : payload.times
      mockRechargePackages[idx] = {
        ...mockRechargePackages[idx],
        name: payload.name,
        points,
        times: points,
        price: payload.price,
        originalPrice: payload.originalPrice,
        tag: payload.tag || '',
        expireDays: payload.expireDays,
        sort: payload.sort,
        enabled: payload.enabled !== false,
        updateTimeText: new Date().toLocaleString('zh-CN')
      }
      return mockRechargePackages[idx]
    }
    case 'rechargePackages.delete': {
      const idx = mockRechargePackages.findIndex((r) => r._id === payload._id)
      if (idx < 0) throw new Error('套餐不存在')
      mockRechargePackages.splice(idx, 1)
      return { deleted: true }
    }
    case 'rechargePackages.seedDefaults':
      if (mockRechargePackages.length) {
        return { seeded: 0, message: '已有套餐数据，未写入默认项' }
      }
      mockRechargePackages.push(
        {
          _id: 'pkg1',
          id: 1,
          name: '散单·体验',
          points: 30,
          times: 30,
          price: 3,
          originalPrice: 3,
          tag: '1人9张',
          expireDays: 365,
          sort: 10,
          enabled: true,
          updateTimeText: '-'
        },
        {
          _id: 'pkg2',
          id: 2,
          name: '散单·小包',
          points: 280,
          times: 280,
          price: 28,
          originalPrice: 30,
          tag: '约10人',
          expireDays: 365,
          sort: 20,
          enabled: true,
          updateTimeText: '-'
        }
      )
      return { seeded: 2, message: '已写入默认套餐' }
    default:
      throw new Error(`Mock 未实现: ${action}`)
  }
}
