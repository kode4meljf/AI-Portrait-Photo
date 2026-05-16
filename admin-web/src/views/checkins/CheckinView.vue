<template>
  <div class="page-card">
    <el-alert
      v-if="!appStore.currentStoreId"
      title="请先在右上角选择门店，再查看打卡名单"
      type="warning"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div class="page-toolbar">
      <el-date-picker
        v-model="date"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="选择日期"
        :disabled="!appStore.currentStoreId"
        @change="loadAll"
      />
      <el-radio-group v-model="type" :disabled="!appStore.currentStoreId" @change="loadList">
        <el-radio-button value="unchecked">未打卡</el-radio-button>
        <el-radio-button value="checked">已打卡</el-radio-button>
      </el-radio-group>
      <el-button type="primary" :disabled="!appStore.currentStoreId" @click="loadAll">刷新</el-button>
    </div>

    <div class="stat-grid" v-if="summary">
      <div class="stat-card">
        <div class="label">昨日打卡</div>
        <div class="value">{{ summary.yesterdayCount ?? 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="label">今日打卡</div>
        <div class="value">{{ summary.todayCount ?? 0 }}</div>
      </div>
      <div class="stat-card">
        <div class="label">今日未打卡</div>
        <div class="value">{{ summary.todayUnchecked ?? 0 }}</div>
      </div>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="nickName" label="客户昵称" min-width="140" />
      <el-table-column prop="phone" label="手机" width="140" />
      <el-table-column prop="totalCheckins" label="累计打卡" width="100" />
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const date = ref(dayjs().format('YYYY-MM-DD'))
const type = ref('unchecked')
const list = ref([])
const summary = ref(null)
const loading = ref(false)

async function loadSummary() {
  if (!appStore.currentStoreId) return
  summary.value = await api.getCheckinSummary({
    storeId: appStore.currentStoreId,
    date: date.value
  })
}

async function loadList() {
  if (!appStore.currentStoreId) {
    list.value = []
    return
  }
  loading.value = true
  try {
    const res = await api.listCheckins({
      storeId: appStore.currentStoreId,
      date: date.value,
      type: type.value
    })
    list.value = res.list || []
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  await Promise.all([loadSummary(), loadList()])
}

watch(() => appStore.currentStoreId, loadAll)
onMounted(loadAll)
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}
</style>
