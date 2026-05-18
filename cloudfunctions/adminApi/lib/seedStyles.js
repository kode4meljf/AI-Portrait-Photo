const SEED_STYLES = [
  { id: 'S01', name: '机长照', prompt: 'professional airline pilot portrait, studio lighting, crisp uniform, confident expression', sampleFileId: '/assets/templates/simple.jpg', sort: 10, enabled: true },
  { id: 'S02', name: '港风街拍', prompt: 'Hong Kong street fashion portrait, neon city bokeh, cinematic mood', sampleFileId: '/assets/templates/flower.jpg', sort: 20, enabled: true },
  { id: 'S03', name: '法式复古', prompt: 'French vintage portrait, soft film tone, elegant retro outfit', sampleFileId: '/assets/templates/hanfu.jpg', sort: 30, enabled: true },
  { id: 'S04', name: '清冷韩系', prompt: 'Korean minimalist portrait, cool tone, clean makeup, airy background', sampleFileId: '/assets/templates/simple.jpg', sort: 40, enabled: true },
  { id: 'S05', name: '日系通勤', prompt: 'Japanese daily commute portrait, natural light, subtle grain', sampleFileId: '/assets/templates/flower.jpg', sort: 50, enabled: true },
  { id: 'S06', name: '胶片人像', prompt: 'film photography portrait, warm grain, analog color', sampleFileId: '/assets/templates/hanfu.jpg', sort: 60, enabled: true },
  { id: 'S07', name: '新中式写真', prompt: 'modern Chinese aesthetic portrait, hanfu elements, soft ink-wash mood', sampleFileId: '/assets/templates/simple.jpg', sort: 70, enabled: true },
  { id: 'S08', name: '轻奢证件照', prompt: 'premium ID photo portrait, even lighting, neat hairstyle, neutral background', sampleFileId: '/assets/templates/flower.jpg', sort: 80, enabled: true },
  { id: 'S09', name: '电影质感', prompt: 'cinematic portrait, dramatic lighting, shallow depth of field', sampleFileId: '/assets/templates/hanfu.jpg', sort: 90, enabled: true }
]

const STYLE_TEMPLATES_COLLECTION = 'style_templates'

async function seedStyles(db) {
  const coll = db.collection(STYLE_TEMPLATES_COLLECTION)
  let inserted = 0
  let updated = 0
  const now = new Date()

  for (const item of SEED_STYLES) {
    const existing = await coll.where({ id: item.id }).limit(1).get()
    const data = {
      id: item.id,
      name: item.name,
      prompt: item.prompt,
      sampleFileId: item.sampleFileId,
      sort: item.sort,
      enabled: item.enabled,
      updateTime: now
    }
    if (existing.data.length) {
      await coll.doc(existing.data[0]._id).update({ data })
      updated += 1
    } else {
      await coll.add({ data: { ...data, createTime: now } })
      inserted += 1
    }
  }

  return { inserted, updated, total: SEED_STYLES.length, ids: SEED_STYLES.map((s) => s.id) }
}

module.exports = { seedStyles, SEED_STYLES }
