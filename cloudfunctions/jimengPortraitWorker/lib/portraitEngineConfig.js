const PORTRAIT_ENGINE_JIMENG = 'jimeng'
const PORTRAIT_ENGINE_SEEDREAM = 'seedream'
const DEFAULT_PORTRAIT_ENGINE = PORTRAIT_ENGINE_JIMENG
const DEFAULT_SEEDREAM_MODEL_ID = 'doubao-seedream-5-0-260128'
const SEEDREAM_MODEL_OPTIONS = [
  'doubao-seedream-4-5-251128',
  'doubao-seedream-5-0-260128'
]
const JIMENG_PORTRAIT_REQ_KEY = 'i2i_portrait_photo'

const PORTRAIT_ENGINE_OPTIONS = [
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

function normalizePortraitEngine(value) {
  const s = String(value || '').trim().toLowerCase()
  if (s === PORTRAIT_ENGINE_SEEDREAM) return PORTRAIT_ENGINE_SEEDREAM
  return PORTRAIT_ENGINE_JIMENG
}

function getPortraitEngineLabel(engine) {
  const normalized = normalizePortraitEngine(engine)
  const opt = PORTRAIT_ENGINE_OPTIONS.find((item) => item.value === normalized)
  return opt ? opt.label : PORTRAIT_ENGINE_OPTIONS[0].label
}

function normalizeSeedreamModelId(value) {
  const s = String(value || '').trim()
  return s || DEFAULT_SEEDREAM_MODEL_ID
}

module.exports = {
  PORTRAIT_ENGINE_JIMENG,
  PORTRAIT_ENGINE_SEEDREAM,
  DEFAULT_PORTRAIT_ENGINE,
  DEFAULT_SEEDREAM_MODEL_ID,
  SEEDREAM_MODEL_OPTIONS,
  JIMENG_PORTRAIT_REQ_KEY,
  PORTRAIT_ENGINE_OPTIONS,
  normalizePortraitEngine,
  getPortraitEngineLabel,
  normalizeSeedreamModelId
}
