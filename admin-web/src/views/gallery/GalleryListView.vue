<template>
  <div class="page-card">
    <el-alert
      v-if="!appStore.currentStoreId"
      title="请先在右上角选择门店，再管理该门店云相册"
      type="warning"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div class="page-toolbar">
      <el-button type="primary" :disabled="!appStore.currentStoreId" :loading="loading" @click="loadList">
        刷新
      </el-button>
    </div>

    <el-table
      :data="list"
      v-loading="loading"
      stripe
      empty-text="暂无云相册批次"
    >
      <el-table-column label="封面" width="88">
        <template #default="{ row }">
          <el-image
            v-if="row.coverUrl"
            :src="row.coverUrl"
            fit="cover"
            class="cover-thumb"
            :preview-src-list="[row.coverUrl]"
            preview-teleported
          />
          <span v-else class="cover-placeholder">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="createTimeText" label="创建时间" width="160" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ row.statusLabel }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="照片" width="120">
        <template #default="{ row }">
          {{ row.generatedCount }} / {{ row.photoCount }}
          <span v-if="row.status === 'generating'" class="progress-hint">({{ row.progressPercent }}%)</span>
        </template>
      </el-table-column>
      <el-table-column prop="styleSummary" label="风格" min-width="140" show-overflow-tooltip />
      <el-table-column prop="customerName" label="关联客户" width="120" />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
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

    <el-dialog v-model="detailVisible" title="批次详情" width="720px" destroy-on-close>
      <div v-if="detailBatch" class="detail-meta">
        <div>创建：{{ detailBatch.createTimeText }}</div>
        <div>状态：{{ detailBatch.statusLabel }} · 照片 {{ detailBatch.generatedCount }}/{{ detailBatch.photoCount }}</div>
        <div>客户：{{ detailBatch.customerName }}</div>
      </div>
      <div v-loading="detailLoading" class="photo-grid">
        <div v-for="p in detailPhotos" :key="p._id" class="photo-card">
          <div class="photo-pair">
            <div class="photo-slot">
              <span class="slot-label">原图</span>
              <el-image
                v-if="p.originalDisplayUrl"
                :src="p.originalDisplayUrl"
                fit="cover"
                class="photo-img"
                :preview-src-list="previewList(p)"
                preview-teleported
              />
              <span v-else class="no-img">无</span>
            </div>
            <div class="photo-slot">
              <span class="slot-label">AI</span>
              <el-image
                v-if="p.aiDisplayUrl"
                :src="p.aiDisplayUrl"
                fit="cover"
                class="photo-img"
                :preview-src-list="previewList(p)"
                preview-teleported
              />
              <span v-else class="no-img">{{ p.generateStatus === 'failed' ? '失败' : '未生成' }}</span>
            </div>
          </div>
          <div class="photo-caption">{{ p.styleName || '—' }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/admin'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()
const list = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const deletingId = ref('')
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailBatch = ref(null)
const detailPhotos = ref([])

function statusTagType(status) {
  if (status === 'completed') return 'success'
  if (status === 'generating') return 'warning'
  if (status === 'partial') return 'danger'
  return 'info'
}

function previewList(photo) {
  return [photo.aiDisplayUrl, photo.originalDisplayUrl].filter(Boolean)
}

async function loadList() {
  if (!appStore.currentStoreId) {
    list.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const res = await api.listGalleryBatches({
      storeId: appStore.currentStoreId,
      page: page.value,
      pageSize: pageSize.value
    })
    list.value = res.list || []
    total.value = res.total || 0
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    loading.value = false
  }
}

function onPageChange(p) {
  page.value = p
  loadList()
}

async function openDetail(row) {
  if (!row?._id || !appStore.currentStoreId) return
  detailVisible.value = true
  detailBatch.value = { ...row }
  detailPhotos.value = []
  detailLoading.value = true
  try {
    const res = await api.getGalleryBatch({
      batchId: row._id,
      storeId: appStore.currentStoreId
    })
    detailBatch.value = res.batch || row
    detailPhotos.value = res.photos || []
  } catch (e) {
    ElMessage.error(e.message)
    detailVisible.value = false
  } finally {
    detailLoading.value = false
  }
}

async function onDelete(row) {
  if (!row?._id || !appStore.currentStoreId) return
  try {
    await ElMessageBox.confirm(
      `确定删除该批次？将一并删除：\n· 云存储中的原图与 AI 成片\n· photos / batches / ai_tasks 等数据库记录\n\n批次：${row.createTimeText || row._id}`,
      '删除云相册批次',
      { type: 'warning', confirmButtonText: '确定删除', cancelButtonText: '取消' }
    )
  } catch {
    return
  }

  deletingId.value = row._id
  try {
    const res = await api.deleteGalleryBatch({
      batchId: row._id,
      storeId: appStore.currentStoreId
    })
    ElMessage.success(
      `已删除：${res.deletedPhotos || 0} 张照片、${res.deletedTasks || 0} 条任务、${res.deletedFiles || 0} 个云文件`
    )
    if (detailVisible.value && detailBatch.value?._id === row._id) {
      detailVisible.value = false
    }
    await loadList()
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  } finally {
    deletingId.value = ''
  }
}

watch(
  () => appStore.currentStoreId,
  () => {
    page.value = 1
    loadList()
  }
)

onMounted(loadList)
</script>

<style scoped>
.mb-16 {
  margin-bottom: 16px;
}

.cover-thumb {
  width: 56px;
  height: 56px;
  border-radius: 6px;
}

.cover-placeholder {
  color: #c0c4cc;
  font-size: 12px;
}

.progress-hint {
  color: #909399;
  font-size: 12px;
}

.pager {
  margin-top: 16px;
  justify-content: flex-end;
}

.detail-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  color: #606266;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  min-height: 80px;
}

.photo-card {
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
}

.photo-pair {
  display: flex;
  gap: 8px;
}

.photo-slot {
  flex: 1;
  min-width: 0;
}

.slot-label {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.photo-img {
  width: 100%;
  height: 100px;
  border-radius: 4px;
}

.no-img {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
  background: #f0f2f5;
  border-radius: 4px;
  font-size: 12px;
  color: #909399;
}

.photo-caption {
  margin-top: 8px;
  font-size: 12px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
