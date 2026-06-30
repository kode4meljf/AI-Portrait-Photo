<template>
  <div class="page-card platform-settings-page" v-loading="loading">
    <h2 class="page-heading">平台配置</h2>
    <p class="page-desc">
      门店小程序订单详情中「联系平台」将展示此处配置的电话；写真生成引擎、密钥与并发由 Worker 云函数自动读取并缓存；制作影集规则见下方独立配置。
    </p>

    <el-form
      v-if="form"
      :model="form"
      label-width="140px"
      class="settings-form"
      @submit.prevent
    >
      <h3 class="section-title">客服电话</h3>
      <el-form-item label="平台客服电话" required>
        <el-input
          v-model="form.supportPhone"
          placeholder="例如 400-888-8888"
          maxlength="24"
          clearable
        />
        <div class="form-tip">支持数字、空格、横线；留空则门店端提示「暂未配置」</div>
      </el-form-item>

      <h3 class="section-title">写真生成引擎</h3>
      <p class="section-desc">切换下方分段控件将立即写入数据库并生效（智绘引擎须先配置 API Key）；其它项修改后点底部「保存」。</p>

      <el-alert
        v-if="engineStatusWarning"
        type="warning"
        :closable="false"
        show-icon
        class="engine-status-alert"
      >
        <template #title>已选择智绘引擎，但未就绪</template>
        <div class="engine-status-body">
          请填写方舟 API Key 后再保存；保存前门店仍使用上次生效的
          <strong>{{ savedEngineLabel }}</strong>
        </div>
      </el-alert>
      <el-alert
        v-else
        type="success"
        :closable="false"
        show-icon
        class="engine-status-alert"
      >
        <template #title>{{ engineStatusTitle }}</template>
        <div class="engine-status-body">{{ engineStatusBody }}</div>
        <div v-if="form.updateTime" class="engine-status-meta">
          上次变更：{{ formatTime(form.updateTime) }}
        </div>
      </el-alert>

      <el-form-item label="切换生效引擎">
        <el-segmented
          v-model="form.portraitEngine"
          :options="portraitSegmentOptions"
          :disabled="saving"
          class="engine-segmented"
          @change="onPortraitEngineChange"
        />
        <div class="form-tip segment-hint">
          左：稳定人像保真 · 右：豆包 Seedream 多模态生图
        </div>
      </el-form-item>

      <div v-if="form.portraitEngine === PORTRAIT_ENGINE_JIMENG" class="credentials-wrap">
        <div class="credential-card active">
          <div class="credential-card-head">
            <span class="credential-card-title">
              经典引擎（即梦）
              <code class="engine-req-key">{{ JIMENG_PORTRAIT_REQ_KEY }}</code>
            </span>
            <el-tag type="success" size="small" effect="plain">当前生效</el-tag>
          </div>
          <el-form-item label="Access Key" label-width="108px" class="engine-sub-item">
            <el-input
              v-model="form.volcAccessKey"
              placeholder="留空则不修改已保存的 Access Key"
              clearable
              autocomplete="off"
              class="engine-wide-control"
            />
            <div v-if="form.volcAccessKeyMasked" class="form-tip">
              当前已配置：{{ form.volcAccessKeyMasked }}
            </div>
          </el-form-item>
          <el-form-item label="Secret Key" label-width="108px" class="engine-sub-item">
            <el-input
              v-model="form.volcSecretKey"
              type="password"
              show-password
              placeholder="留空则不修改已保存的 Secret Key"
              clearable
              autocomplete="new-password"
              class="engine-wide-control"
            />
            <div class="form-tip">
              <span v-if="form.volcSecretKeyConfigured">Secret Key 已保存</span>
              <span v-else>尚未配置 Secret Key</span>
              · 云函数内存缓存 5 分钟，鉴权失败时会自动重新读取
            </div>
          </el-form-item>
          <el-form-item label="最大并发" label-width="108px" class="engine-sub-item">
            <el-input-number
              v-model="form.jimengMaxConcurrency"
              :min="1"
              :max="10"
              :step="1"
              :precision="0"
              controls-position="right"
            />
            <div class="form-tip">
              当前保存值：<strong>{{ form.jimengMaxConcurrency }}</strong>
              <template v-if="form.jimengMaxConcurrencyOverriddenByEnv">
                · Worker 实际生效：<strong>{{ form.jimengMaxConcurrencyEffective }}</strong>
                （云函数环境变量 <code>JIMENG_MAX_CONCURRENCY</code> 优先于本配置）
              </template>
              <template v-else>
                · Worker 实际生效：<strong>{{ form.jimengMaxConcurrencyEffective }}</strong>
              </template>
            </div>
            <div class="form-tip">
              与火山账号生成任务并发配额一致：体验版填 1，付费版填 2。修改后约 5 分钟内生效。
            </div>
          </el-form-item>
        </div>
      </div>

      <div v-else class="credentials-wrap">
        <div
          class="credential-card active"
          :class="{ 'pending-key': !seedreamReady }"
        >
          <div class="credential-card-head">
            <span class="credential-card-title">智绘引擎（Seedream / 方舟）</span>
            <el-tag
              v-if="!seedreamReady"
              type="warning"
              size="small"
              effect="plain"
            >
              待配置
            </el-tag>
            <el-tag v-else type="success" size="small" effect="plain">当前生效</el-tag>
          </div>
          <el-form-item label="方舟 API Key" label-width="108px" class="engine-sub-item">
            <el-input
              v-model="form.arkApiKey"
              type="password"
              show-password
              placeholder="留空则不修改已保存的 API Key"
              clearable
              autocomplete="new-password"
              class="engine-wide-control"
            />
            <div v-if="form.arkApiKeyMasked" class="form-tip">
              当前已配置：{{ form.arkApiKeyMasked }}
            </div>
            <div class="form-tip">
              <span v-if="seedreamReady">API Key 已保存</span>
              <span v-else>尚未配置 API Key</span>
              · 在火山方舟控制台创建
            </div>
          </el-form-item>
          <el-form-item label="模型 ID" label-width="108px" class="engine-sub-item">
            <el-select v-model="form.seedreamModelId" class="engine-wide-control">
              <el-option
                v-for="opt in seedreamModelOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <div class="form-tip">成片尺寸由下方清晰度与画幅决定，不再使用各风格「分辨率」</div>
          </el-form-item>
          <el-form-item label="清晰度" label-width="108px" class="engine-sub-item">
            <el-segmented
              v-model="form.seedreamSizeTier"
              :options="seedreamSizeTierOptions"
              class="engine-segmented engine-segmented--compact"
            />
          </el-form-item>
          <el-form-item label="画幅" label-width="108px" class="engine-sub-item">
            <el-segmented
              v-model="form.seedreamOrientation"
              :options="seedreamOrientationOptions"
              class="engine-segmented engine-segmented--compact"
            />
            <div class="form-tip">
              当前成片：
              <strong>{{ seedreamOutputSizePreview }}</strong>
              <template v-if="form.seedreamOrientation === SEEDREAM_ORIENTATION_AUTO">
                · 自动模式请求不传 size，走官方默认
              </template>
            </div>
          </el-form-item>
          <el-form-item label="最大并发" label-width="108px" class="engine-sub-item">
            <el-input-number
              v-model="form.seedreamMaxConcurrency"
              :min="1"
              :max="50"
              :step="1"
              :precision="0"
              controls-position="right"
            />
            <div class="form-tip">
              当前保存值：<strong>{{ form.seedreamMaxConcurrency }}</strong>
              <template v-if="form.seedreamMaxConcurrencyOverriddenByEnv">
                · Worker 实际生效：<strong>{{ form.seedreamMaxConcurrencyEffective }}</strong>
                （云函数环境变量 <code>SEEDREAM_MAX_CONCURRENCY</code> 优先于本配置）
              </template>
              <template v-else>
                · Worker 实际生效：<strong>{{ form.seedreamMaxConcurrencyEffective }}</strong>
              </template>
            </div>
            <div class="form-tip">
              方舟 Seedream 按 IPM（约 500 张/分钟）限流；建议 10～20，遇 429 再调低。修改后约 5 分钟内生效。
            </div>
          </el-form-item>
        </div>
      </div>

      <h3 class="section-title section-title--spaced">制作影集</h3>
      <el-alert
        v-if="albumConfigIssues.length"
        type="error"
        :closable="false"
        show-icon
        class="album-config-alert"
        title="影集配置无效，无法保存"
      >
        <ul class="album-config-issue-list">
          <li v-for="(issue, index) in albumConfigIssues" :key="index">{{ issue }}</li>
        </ul>
      </el-alert>
      <el-form-item label="准入成片数" :error="albumEntryError">
        <el-input-number
          v-model="form.albumEntryMinTotal"
          :min="form.albumSelectMax"
          :max="500"
          :step="1"
          :precision="0"
          controls-position="right"
        />
        <div class="form-tip">
          客户 AI 写真达到该数量后，门店端才可进入「制作影集」；须不小于「最多选图张数」
        </div>
      </el-form-item>
      <el-form-item label="最少选图张数" :error="albumSelectMinError">
        <el-input-number
          v-model="form.albumSelectMin"
          :min="1"
          :max="form.albumSelectMax"
          :step="1"
          :precision="0"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="最多选图张数" :error="albumSelectMaxError">
        <el-input-number
          v-model="form.albumSelectMax"
          :min="form.albumSelectMin"
          :max="200"
          :step="1"
          :precision="0"
          controls-position="right"
        />
        <div class="form-tip">提交影集订单时，选图数量须在此区间内（默认 30～40 张）</div>
      </el-form-item>
      <el-form-item label="积分单价">
        <el-input-number
          v-model="form.albumPointsPerPhoto"
          :min="1"
          :max="999"
          :step="1"
          :precision="0"
          controls-position="right"
        />
        <div class="form-tip">
          每张入选写真消耗的门店积分；提交时按「张数 × 单价」扣费（默认 23 积分/张）
        </div>
      </el-form-item>

      <el-form-item v-if="form.updateTime" label="最近更新">
        <span class="muted">{{ formatTime(form.updateTime) }}</span>
      </el-form-item>
      <el-form-item v-if="form.volcKeysUpdateTime" label="密钥更新">
        <span class="muted">{{ formatTime(form.volcKeysUpdateTime) }}</span>
      </el-form-item>
    </el-form>

    <div v-if="form" class="settings-actions-bar">
      <el-button
        type="primary"
        :loading="saving"
        :disabled="!canSave"
        @click="save"
      >
        保存
      </el-button>
      <el-button :disabled="loading || saving" @click="load">刷新</el-button>
      <span v-if="saveBlockedReason" class="save-blocked-tip">{{ saveBlockedReason }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'
import {
  DEFAULT_PORTRAIT_ENGINE,
  DEFAULT_SEEDREAM_MODEL_ID,
  JIMENG_PORTRAIT_REQ_KEY,
  SEEDREAM_MODEL_OPTIONS,
  PORTRAIT_ENGINE_JIMENG,
  PORTRAIT_ENGINE_SEEDREAM,
  normalizePortraitEngine,
  getPortraitEngineLabel
} from '@/utils/portraitEngine'
import {
  DEFAULT_SEEDREAM_ORIENTATION,
  DEFAULT_SEEDREAM_SIZE_TIER,
  SEEDREAM_ORIENTATION_AUTO,
  SEEDREAM_ORIENTATION_OPTIONS,
  SEEDREAM_SIZE_TIER_OPTIONS,
  describeSeedreamOutputSize,
  normalizeSeedreamOrientation,
  normalizeSeedreamSizeTier
} from '@/utils/seedreamOutputSize'

const portraitSegmentOptions = [
  { label: '经典引擎（即梦）', value: PORTRAIT_ENGINE_JIMENG },
  { label: '智绘引擎', value: PORTRAIT_ENGINE_SEEDREAM }
]
const seedreamModelOptions = SEEDREAM_MODEL_OPTIONS
const seedreamSizeTierOptions = SEEDREAM_SIZE_TIER_OPTIONS
const seedreamOrientationOptions = SEEDREAM_ORIENTATION_OPTIONS

const loading = ref(false)
const saving = ref(false)
const form = ref(null)
/** 服务端已保存的成片引擎（保存成功或初次加载后更新） */
const savedPortraitEngine = ref(DEFAULT_PORTRAIT_ENGINE)
/** 程序化回退引擎选项时，跳过 @change 自动保存 */
const skipEngineAutoSave = ref(false)

function collectAlbumConfigIssues(values) {
  if (!values) return []
  const albumSelectMin = Number(values.albumSelectMin)
  const albumSelectMax = Number(values.albumSelectMax)
  const albumEntryMinTotal = Number(values.albumEntryMinTotal)
  const issues = []

  if (!Number.isFinite(albumSelectMin) || !Number.isFinite(albumSelectMax)) {
    issues.push('请填写完整的选图张数区间')
    return issues
  }
  if (albumSelectMin > albumSelectMax) {
    issues.push(
      `最少选图张数（${albumSelectMin}）不能大于最多选图张数（${albumSelectMax}）`
    )
  }
  if (Number.isFinite(albumEntryMinTotal) && albumEntryMinTotal < albumSelectMax) {
    issues.push(
      `准入成片数（${albumEntryMinTotal}）不能小于最多选图张数（${albumSelectMax}）。` +
        `请把准入成片数提高到至少 ${albumSelectMax} 张，或将最多选图张数降到不超过 ${albumEntryMinTotal} 张`
    )
  }
  return issues
}

const albumConfigIssues = computed(() => collectAlbumConfigIssues(form.value))
const albumConfigValid = computed(() => albumConfigIssues.value.length === 0)

const albumEntryError = computed(() => {
  const issue = albumConfigIssues.value.find((text) => text.startsWith('准入成片数'))
  return issue || ''
})

const albumSelectMinError = computed(() => {
  const issue = albumConfigIssues.value.find((text) => text.startsWith('最少选图张数'))
  return issue || ''
})

const albumSelectMaxError = computed(() => {
  const f = form.value
  if (!f) return ''
  const entry = Number(f.albumEntryMinTotal)
  const max = Number(f.albumSelectMax)
  if (Number.isFinite(entry) && Number.isFinite(max) && entry < max) {
    return `最多选图 ${max} 张时，准入成片数须至少 ${max} 张（当前 ${entry} 张）`
  }
  return ''
})

const seedreamReady = computed(() => {
  const f = form.value
  if (!f) return false
  return !!f.arkApiKeyConfigured || !!(f.arkApiKey || '').trim()
})

const seedreamOutputSizePreview = computed(() => {
  const f = form.value
  if (!f) return ''
  return describeSeedreamOutputSize(f.seedreamSizeTier, f.seedreamOrientation)
})

const engineStatusWarning = computed(() => {
  return (
    form.value?.portraitEngine === PORTRAIT_ENGINE_SEEDREAM && !seedreamReady.value
  )
})

const savedEngineLabel = computed(() => getPortraitEngineLabel(savedPortraitEngine.value))

const engineStatusTitle = computed(() => {
  const f = form.value
  if (!f) return ''
  if (f.portraitEngine === PORTRAIT_ENGINE_SEEDREAM) {
    const model = (f.seedreamModelId || DEFAULT_SEEDREAM_MODEL_ID).trim()
    return `当前全平台成片引擎：智绘引擎（${model}）`
  }
  return '当前全平台成片引擎：经典引擎（即梦）'
})

const engineStatusBody = computed(() => {
  const f = form.value
  if (!f) return ''
  if (f.portraitEngine === PORTRAIT_ENGINE_SEEDREAM) {
    const model = (f.seedreamModelId || DEFAULT_SEEDREAM_MODEL_ID).trim()
    const sizeHint = describeSeedreamOutputSize(f.seedreamSizeTier, f.seedreamOrientation)
    return `同步图生图 · 模型 ${model} · 成片 ${sizeHint} · 密钥已就绪`
  }
  const keyHint = f.volcSecretKeyConfigured ? '密钥已就绪' : '请配置即梦 Access Key / Secret Key'
  return `门店拍摄提交后走 ${JIMENG_PORTRAIT_REQ_KEY} · ${keyHint}`
})

const saveBlockedReason = computed(() => {
  const phone = (form.value?.supportPhone || '').trim()
  if (!phone) return '请先填写平台客服电话后再保存'
  if (!albumConfigValid.value) return '影集配置无效，请按上方红色提示修正后再保存'
  if (engineStatusWarning.value) {
    return '智绘引擎须先配置方舟 API Key'
  }
  return ''
})

const canSave = computed(() => !saveBlockedReason.value)

function formatTime(t) {
  if (!t) return '-'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return String(t)
  return d.toLocaleString('zh-CN')
}

function clampJimengMaxConcurrency(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(10, Math.max(1, Math.floor(n)))
}

function clampSeedreamMaxConcurrency(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 10
  return Math.min(50, Math.max(1, Math.floor(n)))
}

function clampAlbumInt(raw, fallback, min, max) {
  const n = Math.floor(Number(raw))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function applyAlbumFormFields(data) {
  const albumSelectMin = clampAlbumInt(data?.albumSelectMin, 30, 1, 200)
  let albumSelectMax = clampAlbumInt(data?.albumSelectMax, 40, albumSelectMin, 200)
  if (albumSelectMax < albumSelectMin) albumSelectMax = albumSelectMin
  const albumEntryMinTotal = clampAlbumInt(
    data?.albumEntryMinTotal,
    40,
    albumSelectMax,
    500
  )
  const albumPointsPerPhoto = clampAlbumInt(data?.albumPointsPerPhoto, 23, 1, 999)
  return { albumSelectMin, albumSelectMax, albumEntryMinTotal, albumPointsPerPhoto }
}

function applyPlatformForm(data) {
  const savedJimeng = clampJimengMaxConcurrency(data?.jimengMaxConcurrency)
  const effectiveJimeng = clampJimengMaxConcurrency(
    data?.jimengMaxConcurrencyEffective != null
      ? data.jimengMaxConcurrencyEffective
      : savedJimeng
  )
  const savedSeedream = clampSeedreamMaxConcurrency(data?.seedreamMaxConcurrency)
  const effectiveSeedream = clampSeedreamMaxConcurrency(
    data?.seedreamMaxConcurrencyEffective != null
      ? data.seedreamMaxConcurrencyEffective
      : savedSeedream
  )
  return {
    ...data,
    ...applyAlbumFormFields(data),
    portraitEngine: normalizePortraitEngine(data?.portraitEngine || DEFAULT_PORTRAIT_ENGINE),
    seedreamModelId: (data?.seedreamModelId || DEFAULT_SEEDREAM_MODEL_ID).trim(),
    seedreamSizeTier: normalizeSeedreamSizeTier(
      data?.seedreamSizeTier || DEFAULT_SEEDREAM_SIZE_TIER
    ),
    seedreamOrientation: normalizeSeedreamOrientation(
      data?.seedreamOrientation || DEFAULT_SEEDREAM_ORIENTATION
    ),
    jimengMaxConcurrency: savedJimeng,
    jimengMaxConcurrencyEffective: effectiveJimeng,
    jimengMaxConcurrencyOverriddenByEnv: !!data?.jimengMaxConcurrencyOverriddenByEnv,
    seedreamMaxConcurrency: savedSeedream,
    seedreamMaxConcurrencyEffective: effectiveSeedream,
    seedreamMaxConcurrencyOverriddenByEnv: !!data?.seedreamMaxConcurrencyOverriddenByEnv,
    volcAccessKey: '',
    volcSecretKey: '',
    arkApiKey: ''
  }
}

async function load() {
  loading.value = true
  try {
    const data = await api.getPlatformSettings()
    form.value = applyPlatformForm(data)
    savedPortraitEngine.value = normalizePortraitEngine(
      data?.portraitEngine || DEFAULT_PORTRAIT_ENGINE
    )
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function buildSavePayload() {
  const supportPhone = (form.value?.supportPhone || '').trim()
  const issues = collectAlbumConfigIssues(form.value)
  const { albumSelectMin, albumSelectMax, albumEntryMinTotal, albumPointsPerPhoto } =
    form.value || {}

  const payload = {
    supportPhone,
    portraitEngine: form.value?.portraitEngine || DEFAULT_PORTRAIT_ENGINE,
    seedreamModelId: (form.value?.seedreamModelId || DEFAULT_SEEDREAM_MODEL_ID).trim(),
    seedreamSizeTier: normalizeSeedreamSizeTier(
      form.value?.seedreamSizeTier || DEFAULT_SEEDREAM_SIZE_TIER
    ),
    seedreamOrientation: normalizeSeedreamOrientation(
      form.value?.seedreamOrientation || DEFAULT_SEEDREAM_ORIENTATION
    ),
    jimengMaxConcurrency: form.value?.jimengMaxConcurrency ?? 1,
    seedreamMaxConcurrency: form.value?.seedreamMaxConcurrency ?? 10,
    albumSelectMin,
    albumSelectMax,
    albumEntryMinTotal,
    albumPointsPerPhoto
  }
  const volcAccessKey = (form.value?.volcAccessKey || '').trim()
  const volcSecretKey = (form.value?.volcSecretKey || '').trim()
  if (volcAccessKey) payload.volcAccessKey = volcAccessKey
  if (volcSecretKey) payload.volcSecretKey = volcSecretKey
  const arkApiKey = (form.value?.arkApiKey || '').trim()
  if (arkApiKey) payload.arkApiKey = arkApiKey

  return { payload, supportPhone, issues }
}

function revertPortraitEngineSelection() {
  skipEngineAutoSave.value = true
  form.value.portraitEngine = savedPortraitEngine.value
  skipEngineAutoSave.value = false
}

async function persistSettings(options = {}) {
  const { successMessage = '保存成功', showError = true } = options
  const { payload, supportPhone, issues } = buildSavePayload()

  if (!supportPhone) {
    const msg = '无法保存：请填写平台客服电话'
    if (showError) ElMessage.error(msg)
    throw new Error(msg)
  }
  if (issues.length) {
    const msg = `无法保存：${issues[0]}`
    if (showError) {
      ElMessage.error({
        message: msg,
        duration: 6000,
        showClose: true
      })
    }
    throw new Error(msg)
  }
  if (
    payload.portraitEngine === PORTRAIT_ENGINE_SEEDREAM &&
    !seedreamReady.value
  ) {
    const msg = '智绘引擎须先配置方舟 API Key'
    if (showError) ElMessage.error(msg)
    throw new Error(msg)
  }

  saving.value = true
  try {
    const data = await api.updatePlatformSettings(payload)
    form.value = applyPlatformForm(data)
    savedPortraitEngine.value = normalizePortraitEngine(
      data?.portraitEngine || DEFAULT_PORTRAIT_ENGINE
    )
    if (successMessage) ElMessage.success(successMessage)
    return data
  } catch (e) {
    if (showError) {
      ElMessage.error({
        message: `保存失败：${e.message || '请稍后重试'}`,
        duration: 6000,
        showClose: true
      })
    }
    throw e
  } finally {
    saving.value = false
  }
}

async function save() {
  try {
    await persistSettings()
  } catch {
    /* 已在 persistSettings 中提示 */
  }
}

async function onPortraitEngineChange(newEngine) {
  if (skipEngineAutoSave.value || !form.value || saving.value) return

  const normalized = normalizePortraitEngine(newEngine)
  if (normalized === savedPortraitEngine.value) return

  if (normalized === PORTRAIT_ENGINE_SEEDREAM && !seedreamReady.value) {
    ElMessage.warning('请先配置方舟 API Key；配置后再次切换将自动保存并生效')
    return
  }

  try {
    await persistSettings({
      successMessage: `引擎已切换为${getPortraitEngineLabel(normalized)}`
    })
  } catch {
    revertPortraitEngineSelection()
  }
}

onMounted(load)
</script>

<style scoped>
.page-heading {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
}

.page-desc {
  margin: 0 0 24px;
  color: #909399;
  font-size: 14px;
  line-height: 1.6;
}

.section-title {
  margin: 8px 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.section-title--spaced {
  margin-top: 28px;
}

.section-desc {
  margin: -8px 0 16px;
  font-size: 13px;
  color: #909399;
  line-height: 1.5;
}

.subsection-title {
  margin: 0 0 12px;
  padding-left: 0;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.subsection-title + .engine-sub-item {
  margin-top: 0;
}

.engine-status-alert {
  margin: 0 0 20px;
}

.engine-status-body {
  font-size: 13px;
  line-height: 1.55;
}

.engine-status-meta {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.85;
}

.engine-segmented {
  max-width: 100%;
}

.engine-segmented--compact {
  max-width: 360px;
}

.segment-hint {
  margin-top: 8px;
}

.credentials-wrap {
  --engine-sub-label-width: 108px;
  margin: 4px 0 16px 140px;
  padding: 16px;
  background: #f9fafb;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  width: calc(100% - 140px);
  box-sizing: border-box;
}

.credential-card {
  padding: 14px 16px;
  background: #fff;
  border: 1px solid var(--el-color-primary);
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.12);
}

.credential-card.pending-key {
  border-left: 3px solid var(--el-color-warning);
}

.credential-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.credential-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
}

.credential-card .engine-sub-item {
  --el-form-label-width: var(--engine-sub-label-width);
  margin-bottom: 14px;
}

.credential-card .engine-sub-item:last-child {
  margin-bottom: 0;
}

.credential-card .engine-sub-item :deep(.el-form-item__label) {
  width: var(--engine-sub-label-width) !important;
  padding-right: 8px !important;
  text-align: right !important;
  white-space: nowrap !important;
  flex: 0 0 var(--engine-sub-label-width) !important;
  justify-content: flex-end;
}

.credential-card .engine-sub-item :deep(.el-form-item__content) {
  margin-left: 0 !important;
  flex: 1;
  min-width: 0;
  max-width: none;
}

.credential-card .engine-wide-control {
  width: 100%;
}

.engine-sub-config {
  --engine-sub-label-width: 108px;
  margin: 4px 0 20px 140px;
  padding: 14px 16px 6px;
  background: #f9fafb;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  width: calc(100% - 140px);
  box-sizing: border-box;
}

.engine-sub-config .engine-sub-item {
  --el-form-label-width: var(--engine-sub-label-width);
  margin-bottom: 18px;
}

.engine-sub-config .engine-sub-item :deep(.el-form-item__label) {
  width: var(--engine-sub-label-width) !important;
  padding-right: 8px !important;
  text-align: right !important;
  white-space: nowrap !important;
  flex: 0 0 var(--engine-sub-label-width) !important;
  justify-content: flex-end;
}

.engine-sub-config .engine-sub-item :deep(.el-form-item__content) {
  margin-left: 0 !important;
  flex: 1;
  min-width: 0;
  max-width: none;
}

.engine-sub-config .engine-wide-control {
  width: 100%;
}

.engine-sub-config .subsection-title:not(:first-child) {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed #e4e7ed;
}

.settings-form {
  max-width: 560px;
}

.form-tip {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.form-tip code {
  font-size: 11px;
  color: #606266;
}

.muted {
  color: #909399;
  font-size: 14px;
}

.album-config-alert {
  margin-bottom: 16px;
}

.album-config-issue-list {
  margin: 8px 0 0;
  padding-left: 18px;
  line-height: 1.6;
}

.platform-settings-page {
  padding-bottom: 4px;
}

.settings-actions-bar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  max-width: 560px;
  margin-top: 8px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  border: 1px solid #ebeef5;
  border-radius: 8px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
}

.save-blocked-tip {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #f56c6c;
}

@media (min-width: 640px) {
  .save-blocked-tip {
    flex: 1 1 auto;
    margin-left: 4px;
  }
}

.engine-req-key {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #475569;
  background: #f1f5f9;
  border-radius: 4px;
  font-weight: 500;
}
</style>
