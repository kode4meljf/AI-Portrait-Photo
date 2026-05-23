<template>
  <div class="page-card">
    <div class="page-toolbar">
      <el-select v-model="sourceRole" clearable placeholder="来源" style="width: 120px" @change="search">
        <el-option label="全部来源" value="" />
        <el-option label="顾客" value="customer" />
        <el-option label="门店" value="store" />
      </el-select>
      <el-select v-model="status" clearable placeholder="状态" style="width: 120px" @change="search">
        <el-option label="全部状态" value="" />
        <el-option label="待处理" value="pending" />
        <el-option label="已读" value="read" />
      </el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索内容/提交人/门店"
        clearable
        style="width: 260px"
        @keyup.enter="search"
      />
      <el-button type="primary" @click="search">搜索</el-button>
    </div>

    <el-table
      :data="list"
      v-loading="loading"
      stripe
      empty-text="暂无反馈"
    >
      <el-table-column prop="createTimeText" label="提交时间" width="160" />
      <el-table-column prop="sourceRoleLabel" label="来源" width="80" />
      <el-table-column prop="submitterName" label="提交人" width="120" />
      <el-table-column prop="submitterPhone" label="账号手机" width="130" />
      <el-table-column prop="storeName" label="关联门店" min-width="140" show-overflow-tooltip />
      <el-table-column label="反馈内容" min-width="220">
        <template #default="{ row }">
          <span class="content-preview">{{ row.content }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="contact" label="留联方式" width="130" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'read' ? 'info' : 'warning'" size="small">
            {{ row.status === 'read' ? '已读' : '待处理' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button
            v-if="row.status !== 'read'"
            link
            type="primary"
            @click="markRead(row)"
          >
            标为已读
          </el-button>
          <el-button
            link
            type="danger"
            :loading="deletingId === row._id"
            @click="onDelete(row)"
          >
            删除
          </el-button>
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

    <el-dialog v-model="detailVisible" title="反馈详情" width="560px">
      <div v-if="detail" class="detail-body">
        <div class="detail-row"><span class="label">提交时间</span>{{ detail.createTimeText }}</div>
        <div class="detail-row"><span class="label">来源</span>{{ detail.sourceRoleLabel }}</div>
        <div class="detail-row"><span class="label">提交人</span>{{ detail.submitterName || '—' }}</div>
        <div class="detail-row"><span class="label">账号手机</span>{{ detail.submitterPhone || '—' }}</div>
        <div class="detail-row"><span class="label">关联门店</span>{{ detail.storeName || '—' }}</div>
        <div class="detail-row"><span class="label">留联方式</span>{{ detail.contact || '—' }}</div>
        <div class="detail-row content-row">
          <span class="label">反馈内容</span>
          <p class="content-full">{{ detail.content }}</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          v-if="detail && detail.status !== 'read'"
          type="primary"
          :loading="saving"
          @click="markRead(detail, true)"
        >
          标为已读
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/admin'

const list = ref([])
const loading = ref(false)
const keyword = ref('')
const sourceRole = ref('')
const status = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const detailVisible = ref(false)
const detail = ref(null)
const saving = ref(false)
const deletingId = ref('')

async function loadList() {
  loading.value = true
  try {
    const res = await api.listFeedbacks({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
      sourceRole: sourceRole.value,
      status: status.value
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

function openDetail(row) {
  detail.value = { ...row }
  detailVisible.value = true
}

async function onDelete(row) {
  const id = row?._id
  if (!id) {
    ElMessage.error('缺少反馈 ID')
    return
  }
  try {
    await ElMessageBox.confirm('确定删除该条反馈？删除后不可恢复。', '提示', {
      type: 'warning',
      appendTo: document.body
    })
  } catch {
    return
  }

  deletingId.value = id
  try {
    await api.deleteFeedback({ _id: id })
    ElMessage.success('已删除')
    if (detail.value?._id === id) {
      detailVisible.value = false
      detail.value = null
    }
    await loadList()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    deletingId.value = ''
  }
}

async function markRead(row, fromDialog = false) {
  if (!row || !row._id) return
  saving.value = true
  try {
    const updated = await api.updateFeedbackStatus({ _id: row._id, status: 'read' })
    ElMessage.success('已标记为已读')
    if (fromDialog) {
      detail.value = updated
      detailVisible.value = false
    }
    await loadList()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

onMounted(loadList)
</script>

<style scoped>
.content-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  color: #606266;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-row {
  display: flex;
  gap: 12px;
  font-size: 14px;
  color: #303133;
  line-height: 1.5;
}

.detail-row .label {
  flex-shrink: 0;
  width: 72px;
  color: #909399;
}

.content-row {
  align-items: flex-start;
}

.content-full {
  margin: 0;
  flex: 1;
  white-space: pre-wrap;
  word-break: break-word;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}
</style>
