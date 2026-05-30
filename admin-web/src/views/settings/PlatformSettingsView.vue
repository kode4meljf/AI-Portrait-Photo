<template>
  <div class="page-card" v-loading="loading">
    <h2 class="page-heading">平台配置</h2>
    <p class="page-desc">
      门店小程序订单详情中「联系平台」将展示此处配置的电话；即梦 AI 密钥在此统一配置，云函数会自动读取并缓存。
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

      <el-form-item v-if="form.updateTime" label="最近更新">
        <span class="muted">{{ formatTime(form.updateTime) }}</span>
      </el-form-item>
      <el-form-item v-if="form.volcKeysUpdateTime" label="密钥更新">
        <span class="muted">{{ formatTime(form.volcKeysUpdateTime) }}</span>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        <el-button @click="load">刷新</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'

const loading = ref(false)
const saving = ref(false)
const form = ref(null)

function formatTime(t) {
  if (!t) return '-'
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return String(t)
  return d.toLocaleString('zh-CN')
}

async function load() {
  loading.value = true
  try {
    const data = await api.getPlatformSettings()
    form.value = {
      ...data,
      volcAccessKey: '',
      volcSecretKey: ''
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function save() {
  const supportPhone = (form.value?.supportPhone || '').trim()
  if (!supportPhone) {
    ElMessage.warning('请填写平台客服电话')
    return
  }

  const payload = { supportPhone }
  const volcAccessKey = (form.value?.volcAccessKey || '').trim()
  const volcSecretKey = (form.value?.volcSecretKey || '').trim()
  if (volcAccessKey) payload.volcAccessKey = volcAccessKey
  if (volcSecretKey) payload.volcSecretKey = volcSecretKey

  saving.value = true
  try {
    const data = await api.updatePlatformSettings(payload)
    form.value = {
      ...data,
      volcAccessKey: '',
      volcSecretKey: ''
    }
    ElMessage.success('保存成功')
  } catch (e) {
    ElMessage.error(e.message)
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

.muted {
  color: #909399;
  font-size: 14px;
}
</style>
