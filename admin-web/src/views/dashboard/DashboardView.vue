<template>
  <div class="dashboard page-card" v-loading="loading">
    <div class="page-toolbar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        @change="loadData"
      />
      <el-button type="primary" @click="loadData">刷新</el-button>
    </div>

    <div class="stat-grid">
      <div v-for="item in statCards" :key="item.label" class="stat-card">
        <div class="label">{{ item.label }}</div>
        <div class="value">{{ item.value }}</div>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>打卡概况</template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="昨日打卡">{{ checkin.yesterdayCount ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="今日打卡">{{ checkin.todayCount ?? '-' }}</el-descriptions-item>
            <el-descriptions-item label="今日未打卡">{{ checkin.todayUnchecked ?? '-' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never">
          <template #header>门店快览</template>
          <el-table :data="storePreview" size="small" empty-text="暂无门店">
            <el-table-column prop="name" label="门店" min-width="120" />
            <el-table-column prop="balance" label="积分" width="90" />
            <el-table-column prop="level" label="等级" width="100" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-card
      v-if="portraitGenerateStats.applicable"
      shadow="never"
      class="generate-stats-card"
    >
      <template #header>生图耗时（全平台）</template>
      <div v-if="portraitGenerateStats.insufficient" class="generate-stats-empty">样本不足</div>
      <div v-else class="generate-stats-body">
        <div class="generate-stats-value">{{ formatGenerateDuration(portraitGenerateStats.avgGenerateMs) }}</div>
        <div class="generate-stats-meta">
          {{ portraitGenerateStats.sizeTierLabel }} · 纯 API 耗时 · 近 {{ portraitGenerateStats.sampleCount }} 张平均
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { api } from '@/api/admin'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const loading = ref(false)
const stats = ref({})
const checkin = ref({})
const storePreview = ref([])
const portraitGenerateStats = ref({ applicable: false })

const dateRange = ref([
  dayjs().startOf('month').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD')
])

const statCards = computed(() => {
  const s = stats.value
  const base = [
    { label: '订单金额(元)', value: s.totalAmount ?? 0 },
    { label: '相框订单数', value: s.frameCount ?? 0 },
    { label: '客户总数', value: s.customerCount ?? 0 }
  ]
  if (!appStore.currentStoreId) {
    base.unshift({ label: '门店数量', value: s.storeCount ?? storePreview.value.length })
  }
  return base
})

function formatGenerateDuration(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n < 1000) return `${n}ms`
  const seconds = n / 1000
  return seconds >= 10 ? `${Math.round(seconds)}s` : `${seconds.toFixed(1)}s`
}

async function loadData() {
  loading.value = true
  try {
    const [startDate, endDate] = dateRange.value || []
    const params = { startDate, endDate }
    if (appStore.currentStoreId) params.storeId = appStore.currentStoreId
    const data = await api.getDashboard(params)
    stats.value = { ...data.stats, storeCount: data.storeCount }
    checkin.value = data.checkin || {}
    storePreview.value = data.stores || (data.store ? [data.store] : [])
    portraitGenerateStats.value = data.portraitGenerateStats || { applicable: false }
  } finally {
    loading.value = false
  }
}

watch(() => appStore.currentStoreId, loadData)
onMounted(loadData)
</script>

<style scoped>
.generate-stats-card {
  margin-top: 16px;
}

.generate-stats-empty {
  color: #909399;
  font-size: 15px;
}

.generate-stats-value {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
}

.generate-stats-meta {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
}
</style>
