<template>
  <div class="page-card">
    <el-alert
      title="编号 S01 起自动分配；样图为效果参考；成片分辨率默认 1536:1152（4:3 横图）"
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
      <el-button type="primary" plain @click="openCreate">新增风格</el-button>
      <span v-if="enabledCount !== null" class="enabled-tip">已启用 {{ enabledCount }} 个</span>
    </div>

    <el-table :data="list" v-loading="loading" stripe empty-text="暂无数据">
      <el-table-column label="样图" width="88">
        <template #default="{ row }">
          <ClickImagePreview
            v-if="row.sampleUrl"
            :src="row.sampleUrl"
            :alt="row.name"
            thumb-class="sample-preview"
          />
          <span v-else class="text-muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="编号" width="80" />
      <el-table-column prop="name" label="名称" width="120" />
      <el-table-column label="适用性别" width="88" align="center">
        <template #default="{ row }">
          {{ row.gender || '男' }}
        </template>
      </el-table-column>
      <el-table-column prop="resolution" label="分辨率" width="112" show-overflow-tooltip />
      <el-table-column prop="prompt" label="提示词" min-width="200" show-overflow-tooltip />
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
      :title="isCreate ? '新增风格' : '编辑风格'"
      width="560px"
      destroy-on-close
    >
      <el-form :model="editForm" label-width="90px">
        <el-form-item v-if="isCreate" label="编号">
          <span class="id-preview">{{ nextStyleId || 'S01–S12 已满' }}</span>
          <p class="id-hint">保存时自动分配，无需填写</p>
        </el-form-item>
        <el-form-item v-else label="编号">
          <el-input v-model="editForm.id" disabled />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" placeholder="名称不可重复" />
        </el-form-item>
        <el-form-item label="适用性别" required>
          <div class="gender-row-ctrl gender-row-ctrl--form">
            <div class="gender-filter">
              <button
                v-for="opt in genderOptions"
                :key="opt.value"
                type="button"
                class="gender-filter-btn"
                :class="{ active: editForm.gender === opt.value }"
                @click="editForm.gender = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="提示词" required>
          <el-input
            v-model="editForm.prompt"
            type="textarea"
            :rows="4"
            placeholder="传给第三方 AI 的英文或中文提示词"
          />
        </el-form-item>
        <el-form-item label="分辨率" required class="form-item-resolution">
          <div class="resolution-editor">
            <div class="resolution-inputs">
              <div class="resolution-field">
                <label class="resolution-label">宽</label>
                <el-input-number
                  v-model="editForm.resolutionWidth"
                  :min="RESOLUTION_SIDE_MIN"
                  :max="RESOLUTION_SIDE_MAX"
                  :precision="0"
                  :controls="false"
                  class="resolution-num"
                />
              </div>
              <span class="resolution-times" aria-hidden="true">×</span>
              <div class="resolution-field">
                <label class="resolution-label">高</label>
                <el-input-number
                  v-model="editForm.resolutionHeight"
                  :min="RESOLUTION_SIDE_MIN"
                  :max="RESOLUTION_SIDE_MAX"
                  :precision="0"
                  :controls="false"
                  class="resolution-num"
                />
              </div>
            </div>
            <p class="field-hint">{{ resolutionHint }}</p>
          </div>
        </el-form-item>
        <el-form-item label="风格样图" required>
          <StyleSampleUpload
            v-model="editForm.sampleFileId"
            v-model:display-url="editForm.sampleUrl"
          />
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
        <el-button type="primary" :loading="saving" @click="saveStyle">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api } from '@/api/admin'
import { previewNextStyleId } from '@/utils/styleId'
import StyleSampleUpload from '@/components/StyleSampleUpload.vue'
import ClickImagePreview from '@/components/ClickImagePreview.vue'
import {
  DEFAULT_RESOLUTION_HEIGHT,
  DEFAULT_RESOLUTION_WIDTH,
  RESOLUTION_SIDE_MAX,
  RESOLUTION_SIDE_MIN,
  STYLE_RESOLUTION_HINT,
  buildStyleResolution,
  parseStyleResolution
} from '@/utils/styleResolution'
import {
  DEFAULT_STYLE_GENDER,
  STYLE_GENDER_OPTIONS,
  normalizeStyleGender
} from '@/utils/styleGender'

const resolutionHint = STYLE_RESOLUTION_HINT
const genderOptions = STYLE_GENDER_OPTIONS

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
const nextStyleId = ref('')

async function loadList() {
  loading.value = true
  try {
    const res = await api.listStyles({
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
  nextStyleId.value = previewNextStyleId(list.value) || ''
  editForm.value = {
    name: '',
    gender: DEFAULT_STYLE_GENDER,
    prompt: '',
    resolutionWidth: DEFAULT_RESOLUTION_WIDTH,
    resolutionHeight: DEFAULT_RESOLUTION_HEIGHT,
    sampleFileId: '',
    sampleUrl: '',
    sort: (list.value.length + 1) * 10,
    enabled: true
  }
  dialogVisible.value = true
}

function openEdit(row) {
  isCreate.value = false
  const { width, height } = parseStyleResolution(row.resolution)
  editForm.value = {
    _id: row._id,
    id: row.id,
    name: row.name,
    gender: normalizeStyleGender(row.gender),
    prompt: row.prompt || '',
    resolutionWidth: width,
    resolutionHeight: height,
    sampleFileId: row.sampleFileId || '',
    sampleUrl: row.sampleUrl || '',
    sort: row.sort != null ? row.sort : 0,
    enabled: row.enabled !== false
  }
  dialogVisible.value = true
}

async function saveStyle() {
  if (!editForm.value.sampleFileId) {
    ElMessage.warning('请上传风格样图')
    return
  }
  let resolution
  try {
    resolution = buildStyleResolution(
      editForm.value.resolutionWidth,
      editForm.value.resolutionHeight
    )
  } catch (e) {
    ElMessage.warning(e.message || '分辨率不正确')
    return
  }
  saving.value = true
  try {
    if (isCreate.value) {
      await api.createStyle({
        name: editForm.value.name,
        gender: editForm.value.gender,
        prompt: editForm.value.prompt,
        resolution,
        sampleFileId: editForm.value.sampleFileId,
        sort: editForm.value.sort,
        enabled: editForm.value.enabled
      })
      ElMessage.success('已创建')
    } else {
      await api.updateStyle({
        _id: editForm.value._id,
        name: editForm.value.name,
        gender: editForm.value.gender,
        prompt: editForm.value.prompt,
        resolution,
        sampleFileId: editForm.value.sampleFileId,
        sort: editForm.value.sort,
        enabled: editForm.value.enabled
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
    await ElMessageBox.confirm(`确定删除风格「${row.name}」？`, '提示', { type: 'warning' })
    await api.deleteStyle({ _id: row._id })
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
.sample-preview {
  width: 56px;
  height: 75px;
  border-radius: 6px;
}
.text-muted {
  color: #c0c4cc;
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
.field-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.45;
}
.form-item-resolution.el-form-item {
  align-items: flex-start;
}

.form-item-resolution :deep(.el-form-item__label) {
  padding-top: 22px;
  line-height: 32px;
}

.resolution-editor {
  width: 100%;
}

.resolution-inputs {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.resolution-field {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.resolution-label {
  font-size: 12px;
  color: #606266;
  line-height: 1;
  font-weight: 500;
  cursor: default;
}

.resolution-num {
  width: 108px;
}

.resolution-num :deep(.el-input__wrapper) {
  width: 100%;
}

.resolution-times {
  flex-shrink: 0;
  color: #909399;
  font-size: 14px;
  line-height: 32px;
  user-select: none;
}

.gender-row-ctrl--form {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 140px;
  width: 140px;
  margin-left: auto;
}

.gender-row-ctrl--form .gender-filter {
  width: 140px;
  background: #f4f4f5;
  border: 1px solid #e4e4e7;
}

.gender-filter {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  background: #fff;
  border-radius: 18px;
  gap: 2px;
  box-sizing: border-box;
}

.gender-row-ctrl--form .gender-filter-btn {
  flex: 1;
  min-width: 0;
}

.gender-filter-btn {
  min-width: 34px;
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 13px;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-sizing: border-box;
}

.gender-filter-btn.active {
  background: #111827;
  color: #fff;
  font-weight: 600;
}
</style>
