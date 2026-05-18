<template>
  <div class="page-card">
    <el-alert
      title="编号 F01 起自动分配；样式图比例 9:11，上传至云存储"
      type="info"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div class="page-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索名称 / ID"
        clearable
        style="width: 240px"
        @keyup.enter="search"
      />
      <el-button type="primary" @click="search">搜索</el-button>
      <el-button type="primary" plain @click="openCreate">新增相框</el-button>
      <span v-if="enabledCount !== null" class="enabled-tip">已启用 {{ enabledCount }} 个</span>
    </div>

    <el-table :data="list" v-loading="loading" stripe empty-text="暂无数据">
      <el-table-column label="封面" width="88">
        <template #default="{ row }">
          <ClickImagePreview
            v-if="row.coverUrl"
            :src="row.coverUrl"
            :alt="row.name"
            thumb-class="thumb-preview"
          />
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="编号" width="80" />
      <el-table-column prop="name" label="名称" width="120" />
      <el-table-column label="尺寸（可选）" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          {{ formatSize(row) }}
        </template>
      </el-table-column>
      <el-table-column prop="material" label="材质（可选）" width="100" show-overflow-tooltip />
      <el-table-column prop="sort" label="排序" width="72" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled !== false ? 'success' : 'info'" size="small">
            {{ row.enabled !== false ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
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

    <el-dialog
      v-model="dialogVisible"
      :title="isCreate ? '新增相框' : '编辑相框'"
      width="520px"
      destroy-on-close
    >
      <el-form :model="editForm" label-width="90px">
        <el-form-item v-if="isCreate" label="编号">
          <span class="id-preview">{{ nextFrameId || '编号已满' }}</span>
          <p class="id-hint">保存时自动分配，无需填写</p>
        </el-form-item>
        <el-form-item v-else label="编号">
          <el-input v-model="editForm.id" disabled />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item :label="SIZE_FORM_LABEL">
          <div class="size-editor">
            <div class="size-inputs">
              <el-input-number
                v-model="editForm.sizeFirst"
                :min="0"
                :precision="1"
                :controls="false"
                placeholder="数值"
                class="size-num"
              />
              <span class="size-unit">{{ editForm.sizeUnit }}</span>
              <span class="size-times">×</span>
              <el-input-number
                v-model="editForm.sizeSecond"
                :min="0"
                :precision="1"
                :controls="false"
                placeholder="数值"
                class="size-num"
              />
              <span class="size-unit">{{ editForm.sizeUnit }}</span>
            </div>
            <p class="size-hint">选填；按所选顺序填写，小程序展示为「20cm × 25cm」</p>
          </div>
        </el-form-item>
        <el-form-item label="材质">
          <el-input v-model="editForm.material" placeholder="选填，如 原木" />
        </el-form-item>
        <el-form-item label="样式图" required>
          <FrameThumbUpload v-model="editForm.coverFileId" v-model:display-url="editForm.coverUrl" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="editForm.sort" :min="0" :max="999" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="editForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveFrame">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/admin'
import {
  SIZE_FORM_LABEL,
  buildFrameSizePayload,
  formatFrameSizeDisplay,
  parseFrameSizeToForm
} from '@/utils/frameSize'
import { previewNextFrameId } from '@/utils/frameId'
import FrameThumbUpload from '@/components/FrameThumbUpload.vue'
import ClickImagePreview from '@/components/ClickImagePreview.vue'

const list = ref([])
const loading = ref(false)
const keyword = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const enabledCount = ref(null)
const dialogVisible = ref(false)
const saving = ref(false)
const isCreate = ref(false)
const editForm = ref({})
const nextFrameId = ref('')

function formatSize(row) {
  return formatFrameSizeDisplay(row)
}

function defaultSizeFields() {
  return {
    sizeFirst: null,
    sizeSecond: null,
    sizeUnit: 'cm'
  }
}

async function loadList() {
  loading.value = true
  try {
    const res = await api.listFrames({
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value
    })
    list.value = res.list || []
    total.value = res.total || 0
    enabledCount.value = res.enabledCount ?? null
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

function openCreate() {
  isCreate.value = true
  nextFrameId.value = previewNextFrameId(list.value) || ''
  editForm.value = {
    name: '',
    coverFileId: '',
    coverUrl: '',
    material: '',
    sort: (list.value.length + 1) * 10,
    enabled: true,
    ...defaultSizeFields()
  }
  dialogVisible.value = true
}

function openEdit(row) {
  isCreate.value = false
  editForm.value = {
    _id: row._id,
    id: row.id,
    name: row.name,
    coverFileId: row.coverFileId || '',
    coverUrl: row.coverUrl || '',
    material: row.material || '',
    sort: row.sort != null ? row.sort : 0,
    enabled: row.enabled !== false,
    ...parseFrameSizeToForm(row)
  }
  dialogVisible.value = true
}

async function saveFrame() {
  if (!editForm.value.coverFileId) {
    ElMessage.warning('请上传样式图')
    return
  }
  saving.value = true
  try {
    const sizePayload = buildFrameSizePayload(editForm.value)
    const body = {
      ...editForm.value,
      ...sizePayload
    }
    if (isCreate.value) {
      await api.createFrame(body)
      ElMessage.success('已创建')
    } else {
      await api.updateFrame({
        _id: editForm.value._id,
        name: body.name,
        coverFileId: body.coverFileId,
        material: body.material,
        sort: body.sort,
        enabled: body.enabled,
        sizeFirst: body.sizeFirst,
        sizeSecond: body.sizeSecond,
        sizeUnit: body.sizeUnit
      })
      ElMessage.success('已保存')
    }
    dialogVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    saving.value = false
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确定删除相框「${row.name}」？`, '提示', { type: 'warning' })
    await api.deleteFrame({ _id: row._id })
    ElMessage.success('已删除')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

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
.enabled-tip {
  margin-left: auto;
  color: #909399;
  font-size: 13px;
}
.thumb-preview {
  width: 56px;
  height: 56px;
  border-radius: 6px;
}
.text-muted {
  color: #c0c4cc;
}
.size-editor {
  width: 100%;
}
.size-inputs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.size-num {
  width: 100px;
}
.size-unit {
  color: #606266;
  font-size: 13px;
}
.size-times {
  color: #909399;
  padding: 0 4px;
}
.size-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}
.id-preview {
  font-weight: 600;
  color: var(--el-color-primary);
}
.id-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #909399;
}
</style>
