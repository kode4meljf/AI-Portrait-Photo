<template>
  <div class="page-card">
    <div class="page-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索门店名称/联系人/电话"
        clearable
        style="width: 280px"
        @keyup.enter="search"
      />
      <el-button type="primary" @click="search">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe>
      <el-table-column prop="name" label="门店名称" min-width="140" />
      <el-table-column prop="contactName" label="联系人" width="100" />
      <el-table-column prop="contactPhone" label="电话" width="130" />
      <el-table-column prop="level" label="等级" width="100" />
      <el-table-column prop="balance" label="余额" width="90" />
      <el-table-column label="套餐用量" width="120">
        <template #default="{ row }">
          {{ row.packageUsed || 0 }} / {{ row.packageTotal || 0 }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="goDetail(row._id)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      background
      layout="total, prev, pager, next"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="onPageChange"
    />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'

const router = useRouter()
const list = ref([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

async function loadList() {
  loading.value = true
  try {
    const res = await api.listStores({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value
    })
    list.value = res.list || []
    total.value = res.total || 0
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  loadList()
}

function onPageChange(p) {
  page.value = p
  loadList()
}

function goDetail(id) {
  router.push({ name: 'store-detail', params: { id } })
}

onMounted(loadList)
</script>

<style scoped>
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
