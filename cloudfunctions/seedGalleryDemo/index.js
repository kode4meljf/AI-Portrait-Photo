/**
 * 云相册演示数据：插入 5 个批次，图片 URL 从 photos 集合随机抽取
 *
 * 开发者工具 → 云函数 → seedGalleryDemo → 云端测试：
 * { "action": "seed", "storeId": "store_xxx" }
 * 清除：{ "action": "clear", "storeId": "store_xxx" }
 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const STYLE_NAMES = ['古风写真', '韩系清新', '胶片人像', '法式复古', '港风街拍', '电影质感']
const DEMO_FLAG = 'gallery_demo_v1'

const DEMO_BATCHES = [
  {
    title: '已完成',
    offsetHours: 1,
    photos: [
      { generateStatus: 'completed', isFavorite: true },
      { generateStatus: 'completed', isFavorite: false },
      { generateStatus: 'completed', isFavorite: true }
    ]
  },
  {
    title: '生成中',
    offsetHours: 3,
    photos: [
      { generateStatus: 'completed', isFavorite: false },
      { generateStatus: 'processing', isFavorite: false },
      { generateStatus: 'pending', isFavorite: false },
      { generateStatus: 'pending', isFavorite: false }
    ]
  },
  {
    title: '待生成',
    offsetHours: 8,
    photos: [
      { generateStatus: 'pending', isFavorite: false },
      { generateStatus: 'pending', isFavorite: false }
    ]
  },
  {
    title: '部分失败',
    offsetHours: 26,
    photos: [
      { generateStatus: 'completed', isFavorite: false },
      { generateStatus: 'completed', isFavorite: true },
      { generateStatus: 'failed', isFavorite: false }
    ]
  },
  {
    title: '已完成-收藏',
    offsetHours: 50,
    photos: [
      { generateStatus: 'completed', isFavorite: true },
      { generateStatus: 'completed', isFavorite: true },
      { generateStatus: 'completed', isFavorite: false }
    ]
  }
]

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function buildUrlPool() {
  const pool = []
  const photosRes = await db.collection('photos').limit(80).get()
  photosRes.data.forEach((p) => {
    const original = p.originalUrl || p.aiUrl
    const ai = p.aiUrl || p.originalUrl
    if (original) pool.push({ original, ai: ai || original })
  })

  if (pool.length < 5) {
    const stylesRes = await db.collection('style_templates').limit(30).get()
    stylesRes.data.forEach((s) => {
      const id = s.sampleFileId || s.sampleDisplayUrl
      if (id && String(id).startsWith('cloud://')) {
        pool.push({ original: id, ai: id })
      }
    })
  }

  return shuffle(pool)
}

function pickUrl(pool, index) {
  if (!pool.length) {
    throw new Error('数据库中无可用图片 URL，请先上传 photos 或配置 style_templates 云存储样图')
  }
  return pool[index % pool.length]
}

function photoPayload(batchId, storeId, customerId, spec, urlPair, styleName, createTime) {
  const { generateStatus, isFavorite } = spec
  const hasAi = generateStatus === 'completed' || generateStatus === 'processing'
  return {
    batchId,
    storeId,
    customerId: customerId || null,
    originalUrl: urlPair.original,
    aiUrl: hasAi ? urlPair.ai : null,
    isGenerated: generateStatus === 'completed',
    generateStatus,
    isFavorite: !!isFavorite,
    styleName,
    demoTag: DEMO_FLAG,
    createTime,
    updateTime: createTime
  }
}

async function resolveCustomerIds(storeId) {
  const res = await db.collection('customers').where({ storeId }).limit(10).get()
  return res.data.map((c) => c._id)
}

async function seed(storeId) {
  const urlPool = await buildUrlPool()
  const customerIds = await resolveCustomerIds(storeId)
  const now = Date.now()
  const created = []

  let urlCursor = 0
  for (let i = 0; i < DEMO_BATCHES.length; i++) {
    const demo = DEMO_BATCHES[i]
    const customerId = customerIds.length ? customerIds[i % customerIds.length] : null
    const batchCreateTime = new Date(now - demo.offsetHours * 3600 * 1000)

    const batchRes = await db.collection('batches').add({
      data: {
        storeId,
        customerId,
        status: 'pending',
        photoIds: [],
        demoTag: DEMO_FLAG,
        demoTitle: demo.title,
        createTime: batchCreateTime
      }
    })
    const batchId = batchRes._id
    const photoIds = []

    for (let j = 0; j < demo.photos.length; j++) {
      const spec = demo.photos[j]
      const urlPair = pickUrl(urlPool, urlCursor++)
      const styleName = STYLE_NAMES[(i + j) % STYLE_NAMES.length]
      const photoTime = new Date(batchCreateTime.getTime() + j * 60000)
      const addRes = await db.collection('photos').add({
        data: photoPayload(batchId, storeId, customerId, spec, urlPair, styleName, photoTime)
      })
      photoIds.push(addRes._id)
    }

    await db.collection('batches').doc(batchId).update({
      data: { photoIds, updateTime: new Date() }
    })

    created.push({
      batchId,
      title: demo.title,
      photoCount: demo.photos.length,
      customerId
    })
  }

  return {
    success: true,
    message: `已插入 ${created.length} 个演示批次`,
    batches: created,
    urlPoolSize: urlPool.length
  }
}

async function clear(storeId) {
  const batchRes = await db
    .collection('batches')
    .where({ storeId, demoTag: DEMO_FLAG })
    .limit(50)
    .get()

  let removedPhotos = 0
  for (const batch of batchRes.data) {
    const photosRes = await db.collection('photos').where({ batchId: batch._id }).limit(50).get()
    for (const photo of photosRes.data) {
      await db.collection('photos').doc(photo._id).remove()
      removedPhotos++
    }
    await db.collection('batches').doc(batch._id).remove()
  }

  return {
    success: true,
    message: `已清除 ${batchRes.data.length} 个演示批次、${removedPhotos} 张照片`,
    batchCount: batchRes.data.length,
    photoCount: removedPhotos
  }
}

exports.main = async (event) => {
  const action = event.action || 'seed'
  const storeId = (event.storeId || '').trim()

  if (!storeId || !/^store_/i.test(storeId)) {
    return { success: false, error: '请传入有效 storeId，例如 store_xopluaw5j382' }
  }

  try {
    if (action === 'clear') {
      return await clear(storeId)
    }
    if (action === 'seed') {
      return await seed(storeId)
    }
    return { success: false, error: `未知 action: ${action}，可用 seed / clear` }
  } catch (err) {
    console.error('[seedGalleryDemo]', err)
    return { success: false, error: err.message || '操作失败' }
  }
}
