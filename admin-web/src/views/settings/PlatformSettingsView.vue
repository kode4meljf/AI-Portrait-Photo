<template>
  <div class="page-card" v-loading="loading">
    <h2 class="page-heading">平台配置</h2>
    <p class="page-desc">
      门店小程序订单详情中「联系平台」将展示此处配置的电话，仅门店账号可见。
    </p>

    <el-form
      v-if="form"
      :model="form"
      label-width="120px"
      class="settings-form"
      @submit.prevent
    >
      <el-form-item label="平台客服电话" required>
        <el-input
          v-model="form.supportPhone"
          placeholder="例如 400-888-8888"
          maxlength="24"
          clearable
        />
        <div class="form-tip">支持数字、空格、横线；留空则门店端提示「暂未配置」</div>
      </el-form-item>
      <el-form-item v-if="form.updateTime" label="最近更新">
        <span class="muted">{{ formatTime(form.updateTime) }}</span>
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
    form.value = await api.getPlatformSettings()
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
  saving.value = true
  try {
    form.value = await api.updatePlatformSettings({ supportPhone })
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

.settings-form {
  max-width: 520px;
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
