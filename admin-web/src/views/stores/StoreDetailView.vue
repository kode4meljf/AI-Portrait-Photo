<template>
  <div class="page-card" v-loading="loading">
    <div class="detail-nav">
      <el-button class="back-btn" text circle aria-label="返回" @click="$router.back()">
        <el-icon :size="18"><ArrowLeft /></el-icon>
      </el-button>
    </div>

    <el-form
      v-if="form"
      :model="form"
      label-width="100px"
      class="detail-form"
    >
      <el-form-item label="门店 ID">
        <el-input v-model="form._id" disabled />
      </el-form-item>
      <el-form-item label="门店名称">
        <el-input v-model="form.name" />
      </el-form-item>
      <el-form-item label="联系人">
        <el-input v-model="form.contactName" />
      </el-form-item>
      <el-form-item label="联系电话">
        <el-input v-model="form.contactPhone" />
      </el-form-item>
      <el-form-item label="地址">
        <el-input v-model="form.address" type="textarea" :rows="2" />
      </el-form-item>
      <el-form-item label="会员等级">
        <el-input v-model="form.level" />
      </el-form-item>

      <el-divider content-position="left">账户资产</el-divider>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="asset-alert"
        title="余额与套餐为真实资产。调整须向管理员手机发送验证码，验证通过后立即生效。"
      />

      <div class="asset-readonly">
        <div class="asset-item">
          <span class="asset-label">账户余额</span>
          <span class="asset-value">{{ form.balance ?? 0 }}</span>
          <span class="asset-unit">次</span>
        </div>
        <div class="asset-item">
          <span class="asset-label">套餐用量</span>
          <span class="asset-value">{{ form.packageUsed ?? 0 }} / {{ form.packageTotal ?? 0 }}</span>
        </div>
      </div>

      <el-form-item>
        <el-button type="warning" plain @click="openAdjustDialog">调整资产</el-button>
      </el-form-item>

      <el-form-item v-if="adjustHistory.length" label="调整记录">
        <el-table :data="adjustHistory" size="small" class="adjust-table">
          <el-table-column label="时间" width="160">
            <template #default="{ row }">
              {{ formatTime(row.applyTime || row.createTime) }}
            </template>
          </el-table-column>
          <el-table-column prop="changeSummary" label="变更" min-width="160" />
          <el-table-column prop="reason" label="原因" min-width="100" show-overflow-tooltip />
        </el-table>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="saving" @click="saveProfile">保存基本信息</el-button>
      </el-form-item>
    </el-form>

    <el-dialog v-model="adjustVisible" title="调整门店资产" width="500px" destroy-on-close @closed="resetAdjustDialog">
      <el-form :model="adjustForm" label-width="100px">
        <el-form-item label="账户余额">
          <el-input-number v-model="adjustForm.balance" :min="0" />
        </el-form-item>
        <el-form-item label="套餐总量">
          <el-input-number v-model="adjustForm.packageTotal" :min="0" />
        </el-form-item>
        <el-form-item label="已用套餐">
          <el-input-number v-model="adjustForm.packageUsed" :min="0" />
        </el-form-item>
        <el-form-item label="调整原因" required>
          <el-input
            v-model="adjustForm.reason"
            type="textarea"
            :rows="2"
            placeholder="至少 4 个字"
          />
        </el-form-item>
        <el-form-item label="短信验证" required>
          <div class="sms-row">
            <el-input
              v-model="adjustForm.smsCode"
              maxlength="6"
              placeholder="6 位验证码"
              class="sms-input"
            />
            <el-button :disabled="smsCooldown > 0" :loading="smsSending" @click="sendSmsCode">
              {{ smsCooldown > 0 ? `${smsCooldown}s 后重发` : '获取验证码' }}
            </el-button>
          </div>
          <p v-if="smsPhoneHint" class="sms-hint">验证码将发送至 {{ smsPhoneHint }}</p>
          <p v-if="smsMockHint" class="sms-mock">开发模式：验证码为 123456</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustVisible = false">取消</el-button>
        <el-button type="primary" :loading="adjustSubmitting" @click="submitAdjustWithSms">
          验证并生效
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const form = ref(null)
const adjustments = ref([])
const adjustVisible = ref(false)
const adjustSubmitting = ref(false)
const smsSending = ref(false)
const smsCooldown = ref(0)
const smsPhoneHint = ref('')
const smsMockHint = ref(false)
let smsTimer = null

const adjustForm = reactive({
  balance: 0,
  packageTotal: 0,
  packageUsed: 0,
  reason: '',
  smsCode: ''
})

const adjustHistory = computed(() =>
  adjustments.value.filter((row) => row.status === 'approved').slice(0, 10)
)

function formatTime(value) {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function loadDetail() {
  loading.value = true
  try {
    const storeId = route.params.id
    const [store, adjustRes] = await Promise.all([
      api.getStore(storeId),
      api.listStoreAssetAdjustments({ storeId, page: 1, pageSize: 20 })
    ])
    form.value = store
    adjustments.value = adjustRes.list || []
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function profilePayload() {
  const f = form.value
  return {
    _id: f._id,
    name: f.name,
    contactName: f.contactName,
    contactPhone: f.contactPhone,
    address: f.address,
    level: f.level
  }
}

async function saveProfile() {
  saving.value = true
  try {
    const data = await api.updateStore(profilePayload())
    form.value = { ...form.value, ...data }
    ElMessage.success('基本信息已保存')
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

function resetAdjustDialog() {
  adjustForm.smsCode = ''
  smsPhoneHint.value = ''
  smsMockHint.value = false
}

function openAdjustDialog() {
  adjustForm.balance = form.value.balance ?? 0
  adjustForm.packageTotal = form.value.packageTotal ?? 0
  adjustForm.packageUsed = form.value.packageUsed ?? 0
  adjustForm.reason = ''
  adjustForm.smsCode = ''
  smsPhoneHint.value = ''
  smsMockHint.value = false
  adjustVisible.value = true
}

function startSmsCooldown(seconds = 60) {
  smsCooldown.value = seconds
  if (smsTimer) clearInterval(smsTimer)
  smsTimer = setInterval(() => {
    smsCooldown.value -= 1
    if (smsCooldown.value <= 0) {
      clearInterval(smsTimer)
      smsTimer = null
    }
  }, 1000)
}

async function sendSmsCode() {
  smsSending.value = true
  try {
    const res = await api.sendStoreAssetAdjustCode({ storeId: form.value._id })
    smsPhoneHint.value = res.phoneMasked || ''
    smsMockHint.value = Boolean(res.mock)
    ElMessage.success(res.mock ? '验证码已生成（开发模式见下方提示）' : '验证码已发送')
    startSmsCooldown(60)
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    smsSending.value = false
  }
}

async function submitAdjustWithSms() {
  if (!adjustForm.smsCode || adjustForm.smsCode.length !== 6) {
    ElMessage.warning('请输入 6 位短信验证码')
    return
  }
  adjustSubmitting.value = true
  try {
    const res = await api.applyStoreAssetAdjust({
      storeId: form.value._id,
      balance: adjustForm.balance,
      packageTotal: adjustForm.packageTotal,
      packageUsed: adjustForm.packageUsed,
      reason: adjustForm.reason,
      smsCode: adjustForm.smsCode
    })
    form.value = res.store
    ElMessage.success('验证通过，资产已更新')
    adjustVisible.value = false
    await loadDetail()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    adjustSubmitting.value = false
  }
}

onMounted(loadDetail)
onUnmounted(() => {
  if (smsTimer) clearInterval(smsTimer)
})
</script>

<style scoped>
.detail-nav {
  margin: -4px 0 4px;
}

.back-btn {
  color: #606266;
}

.detail-form {
  max-width: 720px;
  margin-top: 16px;
}

.asset-alert {
  margin-bottom: 16px;
}

.asset-readonly {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 8px;
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.asset-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.asset-label {
  font-size: 13px;
  color: #909399;
}

.asset-value {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.asset-unit {
  font-size: 12px;
  color: #909399;
}

.adjust-table {
  width: 100%;
}

.sms-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.sms-input {
  flex: 1;
}

.sms-hint,
.sms-mock {
  margin: 8px 0 0;
  font-size: 12px;
  color: #909399;
}

.sms-mock {
  color: #e6a23c;
}
</style>
