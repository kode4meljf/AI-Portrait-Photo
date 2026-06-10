<template>
  <div class="page-card" v-loading="loading">
    <h2 class="page-heading">平台配置</h2>
    <p class="page-desc">
      门店小程序订单详情中「联系平台」将展示此处配置的电话；制作影集的准入张数、选图区间与积分单价也在此配置；即梦 AI 密钥与生成并发在此统一配置，Worker 云函数会自动读取并缓存。
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

      <h3 class="section-title">即梦 AI 密钥</h3>
      <el-form-item label="Access Key">
        <el-input
          v-model="form.volcAccessKey"
          placeholder="留空则不修改已保存的 Access Key"
          clearable
          autocomplete="off"
        />
        <div v-if="form.volcAccessKeyMasked" class="form-tip">
          当前已配置：{{ form.volcAccessKeyMasked }}
        </div>
      </el-form-item>
      <el-form-item label="Secret Key">
        <el-input
          v-model="form.volcSecretKey"
          type="password"
          show-password
          placeholder="留空则不修改已保存的 Secret Key"
          clearable
          autocomplete="new-password"
        />
        <div class="form-tip">
          <span v-if="form.volcSecretKeyConfigured">Secret Key 已保存</span>
          <span v-else>尚未配置 Secret Key</span>
          · 云函数内存缓存 5 分钟，鉴权失败时会自动重新读取
        </div>
      </el-form-item>

      <h3 class="section-title">制作影集</h3>
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

      <h3 class="section-title">即梦生成调度</h3>
      <el-form-item label="最大并发">
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
          与火山引擎账号的即梦「提交任务」并发配额一致：体验版填 1，付费版填 2。
          修改后约 5 分钟内生效（或等 Worker 实例回收）。
        </div>
      </el-form-item>

      <el-form-item v-if="form.updateTime" label="最近更新">
        <span class="muted">{{ formatTime(form.updateTime) }}</span>
      </el-form-item>
      <el-form-item v-if="form.volcKeysUpdateTime" label="密钥更新">
        <span class="muted">{{ formatTime(form.volcKeysUpdateTime) }}</span>
      </el-form-item>
      <el-form-item>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!canSave"
          @click="save"
        >
          保存
        </el-button>
        <el-button @click="load">刷新</el-button>
        <div v-if="saveBlockedReason" class="form-tip save-blocked-tip">{{ saveBlockedReason }}</div>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)
const form = ref(null)

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

const saveBlockedReason = computed(() => {
  const phone = (form.value?.supportPhone || '').trim()
  if (!phone) return '请先填写平台客服电话后再保存'
  if (!albumConfigValid.value) return '影集配置无效，请按上方红色提示修正后再保存'
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
  const saved = clampJimengMaxConcurrency(data?.jimengMaxConcurrency)
  const effective = clampJimengMaxConcurrency(
    data?.jimengMaxConcurrencyEffective != null
      ? data.jimengMaxConcurrencyEffective
      : saved
  )
  return {
    ...data,
    ...applyAlbumFormFields(data),
    jimengMaxConcurrency: saved,
    jimengMaxConcurrencyEffective: effective,
    jimengMaxConcurrencyOverriddenByEnv: !!data?.jimengMaxConcurrencyOverriddenByEnv,
    volcAccessKey: '',
    volcSecretKey: ''
  }
}

async function load() {
  loading.value = true
  try {
    const data = await api.getPlatformSettings()
    form.value = applyPlatformForm(data)
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function save() {
  const supportPhone = (form.value?.supportPhone || '').trim()
  if (!supportPhone) {
    ElMessage.error('无法保存：请填写平台客服电话')
    return
  }

  const issues = collectAlbumConfigIssues(form.value)
  if (issues.length) {
    ElMessage.error({
      message: `无法保存：${issues[0]}`,
      duration: 6000,
      showClose: true
    })
    return
  }

  const { albumSelectMin, albumSelectMax, albumEntryMinTotal, albumPointsPerPhoto } =
    form.value || {}

  const payload = {
    supportPhone,
    jimengMaxConcurrency: form.value?.jimengMaxConcurrency ?? 1,
    albumSelectMin,
    albumSelectMax,
    albumEntryMinTotal,
    albumPointsPerPhoto
  }
  const volcAccessKey = (form.value?.volcAccessKey || '').trim()
  const volcSecretKey = (form.value?.volcSecretKey || '').trim()
  if (volcAccessKey) payload.volcAccessKey = volcAccessKey
  if (volcSecretKey) payload.volcSecretKey = volcSecretKey

  saving.value = true
  try {
    const data = await api.updatePlatformSettings(payload)
    form.value = applyPlatformForm(data)
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error({
      message: `保存失败：${e.message || '请稍后重试'}`,
      duration: 6000,
      showClose: true
    })
  } finally {
    saving.value = false
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

.save-blocked-tip {
  margin-top: 10px;
  color: #f56c6c;
}
</style>
