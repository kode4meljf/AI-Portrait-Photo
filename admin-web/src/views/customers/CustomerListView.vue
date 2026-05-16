<template>
  <div class="page-card">
    <el-alert
      v-if="!appStore.currentStoreId"
      title="请先在右上角选择门店，再查看该门店客户"
      type="warning"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div class="page-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索昵称/手机号"
        clearable
        style="width: 240px"
        :disabled="!appStore.currentStoreId"
        @keyup.enter="search"
      />
      <el-button type="primary" :disabled="!appStore.currentStoreId" @click="search">搜索</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe empty-text="暂无数据">
      <el-table-column prop="nickName" label="昵称" min-width="120" />
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column prop="equityAlbum" label="相册权益" width="100" />
      <el-table-column prop="equityFrame" label="相框权益" width="100" />
      <el-table-column prop="totalCheckins" label="累计打卡" width="100" />
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
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

    <el-dialog v-model="dialogVisible" title="编辑客户" width="480px">
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickName" />
        </el-form-item>
        <el-form-item label="手机">
          <el-input v-model="editForm.phone" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" />
        </el-form-item>
        <el-form-item label="相册权益">
          <el-input-number v-model="editForm.equityAlbum" :min="0" />
        </el-form-item>
        <el-form-item label="相框权益">
          <el-input-number v-model="editForm.equityFrame" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCustomer">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/api/admin'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const list = ref([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const dialogVisible = ref(false)
const saving = ref(false)
const editForm = ref({})

async function loadList() {
  if (!appStore.currentStoreId) {
    list.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const res = await api.listCustomers({
      storeId: appStore.currentStoreId,
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

function openEdit(row) {
  editForm.value = { ...row }
  dialogVisible.value = true
}

async function saveCustomer() {
  saving.value = true
  try {
    await api.updateCustomer({
      id: editForm.value._id,
      nickName: editForm.value.nickName,
      phone: editForm.value.phone,
      remark: editForm.value.remark,
      equityAlbum: editForm.value.equityAlbum,
      equityFrame: editForm.value.equityFrame
    })
    ElMessage.success('已保存')
    dialogVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

watch(() => appStore.currentStoreId, () => {
  page.value = 1
  loadList()
})

onMounted(loadList)
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}
.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
