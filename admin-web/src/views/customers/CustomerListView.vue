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
      <el-table-column label="客户" min-width="200">
        <template #default="{ row }">
          <div class="customer-cell">
            <el-avatar :size="40" :src="row.avatarDisplayUrl || undefined" class="customer-avatar">
              {{ row.avatarInitial || getAvatarInitial(row) }}
            </el-avatar>
            <div class="customer-meta">
              <span class="customer-name">{{ row.displayName || getCustomerDisplayName(row) }}</span>
              <span v-if="row.showWxNickName" class="customer-wx">微信：{{ row.wxNickNameDisplay }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column label="小程序" width="88" align="center">
        <template #default="{ row }">
          <el-tag :type="row.registered ? 'success' : 'info'" size="small">
            {{ row.registeredLabel }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sourceLabel" label="来源" width="100" />
      <el-table-column prop="remarkDisplay" label="备注" min-width="100" show-overflow-tooltip />
      <el-table-column prop="equityAlbum" label="相册权益" width="92" align="center" />
      <el-table-column prop="equityFrame" label="相框权益" width="92" align="center" />
      <el-table-column prop="totalCheckins" label="累计打卡" width="92" align="center" />
      <el-table-column prop="createTimeText" label="建档时间" width="168" />
      <el-table-column label="操作" width="88" fixed="right">
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

    <el-dialog v-model="dialogVisible" title="编辑客户" width="520px" destroy-on-close>
      <div v-if="editForm._id" class="edit-header">
        <el-avatar :size="56" :src="editForm.avatarDisplayUrl || undefined" class="edit-header-avatar">
          {{ editForm.avatarInitial || getAvatarInitial(editForm) }}
        </el-avatar>
        <div class="edit-header-meta">
          <div class="edit-title">{{ editForm.displayName || getCustomerDisplayName(editForm) }}</div>
          <div class="edit-sub">
            <el-tag :type="editForm.registered ? 'success' : 'info'" size="small">
              {{ editForm.registeredLabel }}
            </el-tag>
            <span>{{ editForm.sourceLabel }}</span>
            <span v-if="editForm.createTimeText">· {{ editForm.createTimeText }}</span>
          </div>
        </div>
      </div>
      <el-form :model="editForm" label-width="96px" class="edit-form">
        <el-form-item label="头像">
          <CustomerAvatarUpload
            v-if="editForm._id"
            :customer-id="editForm._id"
            v-model="editForm.avatarUrl"
            v-model:display-url="editForm.avatarDisplayUrl"
            @change="onAvatarChange"
          />
        </el-form-item>
        <el-form-item label="店长称呼">
          <el-input v-model="editForm.nickName" placeholder="门店内显示名" />
        </el-form-item>
        <el-form-item label="微信昵称">
          <el-input v-model="editForm.wxNickName" disabled placeholder="顾客授权后同步" />
        </el-form-item>
        <el-form-item label="手机">
          <el-input v-model="editForm.phone" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="相册权益">
          <el-input-number v-model="editForm.equityAlbum" :min="0" />
        </el-form-item>
        <el-form-item label="相框权益">
          <el-input-number v-model="editForm.equityFrame" :min="0" />
        </el-form-item>
        <el-form-item label="累计打卡">
          <el-input :model-value="String(editForm.totalCheckins ?? 0)" disabled />
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
import { getCustomerDisplayName, getAvatarInitial } from '@/utils/customerDisplay'
import CustomerAvatarUpload from '@/components/CustomerAvatarUpload.vue'

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

function onAvatarChange() {
  if (editForm.value) {
    editForm.value.avatarInitial = getAvatarInitial(editForm.value)
  }
}

async function openEdit(row) {
  try {
    editForm.value = await api.getCustomer(row._id)
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error(e.message)
  }
}

async function saveCustomer() {
  saving.value = true
  try {
    const updated = await api.updateCustomer({
      id: editForm.value._id,
      nickName: editForm.value.nickName,
      phone: editForm.value.phone,
      remark: editForm.value.remark,
      equityAlbum: editForm.value.equityAlbum,
      equityFrame: editForm.value.equityFrame,
      avatarUrl: editForm.value.avatarUrl ?? ''
    })
    editForm.value = updated
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

.customer-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.customer-avatar {
  flex-shrink: 0;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}

.customer-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.customer-name {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.customer-wx {
  font-size: 12px;
  color: #909399;
}

.edit-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.edit-header-meta {
  min-width: 0;
}

.edit-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.edit-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #909399;
}

.edit-form {
  margin-top: 4px;
}

.edit-header-avatar {
  flex-shrink: 0;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  font-weight: 600;
}
</style>
