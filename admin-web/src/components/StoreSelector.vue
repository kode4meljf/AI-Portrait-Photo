<template>
  <div class="store-selector">
    <span class="label">当前门店</span>
    <el-select
      v-model="selectedId"
      filterable
      clearable
      placeholder="全部门店 / 请选择"
      style="width: 240px"
      :loading="loading"
      @change="onChange"
    >
      <el-option label="（全部门店概览）" value="" />
      <el-option
        v-for="item in stores"
        :key="item._id"
        :label="item.name || item._id"
        :value="item._id"
      />
    </el-select>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { api } from '@/api/admin'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const stores = ref([])
const loading = ref(false)
const selectedId = ref(appStore.currentStoreId)

watch(
  () => appStore.currentStoreId,
  (id) => {
    selectedId.value = id
  }
)

async function loadStores() {
  loading.value = true
  try {
    const res = await api.listStores({ page: 1, pageSize: 200 })
    stores.value = res.list || []
    if (selectedId.value) {
      const found = stores.value.find((s) => s._id === selectedId.value)
      if (found) {
        appStore.setStore(found)
      } else {
        appStore.setStore(null)
        selectedId.value = ''
      }
    }
  } finally {
    loading.value = false
  }
}

function onChange(id) {
  const store = stores.value.find((s) => s._id === id)
  appStore.setStore(store || null)
}

onMounted(loadStores)
</script>

<style scoped>
.store-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-size: 13px;
  color: #909399;
}
</style>
