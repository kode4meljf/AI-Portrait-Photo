const { STYLE_TEMPLATES_COLLECTION } = require('./db')
const { DEFAULT_STYLE_GENDER } = require('./styleGender')

/** S01–S09 默认风格（样图由 upload-style-samples 或后台上传补充） */
const SEED_STYLES = [
  {
    id: 'S01',
    name: '机长照',
    prompt:
      'professional airline pilot portrait, studio lighting, crisp uniform, confident expression',
    resolution: '1536:1152',
    sort: 10,
    enabled: true,
    gender: DEFAULT_STYLE_GENDER
  },
  {
    id: 'S02',
    name: '港风街拍',
    prompt: 'Hong Kong street fashion portrait, neon city bokeh, cinematic mood',
    resolution: '1536:1152',
    sort: 20,
    enabled: true
  },
  {
    id: 'S03',
    name: '法式复古',
    prompt: 'French vintage portrait, soft film tone, elegant retro outfit',
    resolution: '1536:1152',
    sort: 30,
    enabled: true
  },
  {
    id: 'S04',
    name: '清冷韩系',
    prompt: 'Korean minimalist portrait, cool tone, clean makeup, airy background',
    resolution: '1536:1152',
    sort: 40,
    enabled: true
  },
  {
    id: 'S05',
    name: '日系通勤',
    prompt: 'Japanese daily commute portrait, natural light, subtle grain',
    resolution: '1536:1152',
    sort: 50,
    enabled: true
  },
  {
    id: 'S06',
    name: '胶片人像',
    prompt: 'film photography portrait, warm grain, analog color',
    resolution: '1536:1152',
    sort: 60,
    enabled: true
  },
  {
    id: 'S07',
    name: '新中式写真',
    prompt: 'modern Chinese aesthetic portrait, hanfu elements, soft ink-wash mood',
    resolution: '1536:1152',
    sort: 70,
    enabled: true
  },
  {
    id: 'S08',
    name: '轻奢证件照',
    prompt: 'premium ID photo portrait, even lighting, neat hairstyle, neutral background',
    resolution: '1536:1152',
    sort: 80,
    enabled: true
  },
  {
    id: 'S09',
    name: '电影质感',
    prompt: 'cinematic portrait, dramatic lighting, shallow depth of field',
    resolution: '1536:1152',
    sort: 90,
    enabled: true
  }
]

/**
 * 将缺失的默认风格写入 style_templates（已存在同 id 则跳过）
 * @param {import('@cloudbase/node-sdk').Db} db
 */
async function seedStyles(db) {
  const coll = db.collection(STYLE_TEMPLATES_COLLECTION)
  const existingRes = await coll.limit(100).get()
  const existingIds = new Set((existingRes.data || []).map((row) => row.id))

  const now = new Date()
  let created = 0
  let skipped = 0

  for (const row of SEED_STYLES) {
    if (existingIds.has(row.id)) {
      skipped += 1
      continue
    }
    await coll.add({
      data: {
        id: row.id,
        name: row.name,
        prompt: row.prompt,
        resolution: row.resolution || '1536:1152',
        sampleFileId: '',
        sort: row.sort != null ? row.sort : 0,
        enabled: row.enabled !== false,
        gender: row.gender || DEFAULT_STYLE_GENDER,
        createTime: now,
        updateTime: now
      }
    })
    created += 1
    existingIds.add(row.id)
  }

  return {
    created,
    skipped,
    total: SEED_STYLES.length,
    message:
      created > 0
        ? `已新增 ${created} 条默认风格`
        : skipped === SEED_STYLES.length
          ? '默认风格均已存在，未写入'
          : `新增 ${created} 条，跳过 ${skipped} 条`
  }
}

module.exports = {
  SEED_STYLES,
  seedStyles
}
