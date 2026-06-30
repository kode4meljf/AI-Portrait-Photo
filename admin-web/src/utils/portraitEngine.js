export const PORTRAIT_ENGINE_JIMENG = 'jimeng'
export const PORTRAIT_ENGINE_SEEDREAM = 'seedream'
export const DEFAULT_PORTRAIT_ENGINE = PORTRAIT_ENGINE_JIMENG
export const DEFAULT_SEEDREAM_MODEL_ID = 'doubao-seedream-5-0-260128'
export const JIMENG_PORTRAIT_REQ_KEY = 'i2i_portrait_photo'

export const SEEDREAM_MODEL_OPTIONS = [
  { label: 'doubao-seedream-4-5-251128', value: 'doubao-seedream-4-5-251128' },
  { label: 'doubao-seedream-5-0-260128', value: 'doubao-seedream-5-0-260128' }
]

export const PORTRAIT_ENGINE_OPTIONS = [
  {
    value: PORTRAIT_ENGINE_JIMENG,
    label: '经典引擎',
    engineId: JIMENG_PORTRAIT_REQ_KEY,
    description: '即梦人像写真，稳定人像保真'
  },
  {
    value: PORTRAIT_ENGINE_SEEDREAM,
    label: '智绘引擎',
    description: '豆包 Seedream，多模态生图'
  }
]

export function normalizePortraitEngine(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === PORTRAIT_ENGINE_SEEDREAM) return PORTRAIT_ENGINE_SEEDREAM
  return PORTRAIT_ENGINE_JIMENG
}

export function getPortraitEngineLabel(engine) {
  const normalized = normalizePortraitEngine(engine)
  const opt = PORTRAIT_ENGINE_OPTIONS.find((item) => item.value === normalized)
  return opt ? opt.label : PORTRAIT_ENGINE_OPTIONS[0].label
}
