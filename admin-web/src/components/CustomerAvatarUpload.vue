<template>
  <div class="customer-avatar-upload">
    <div class="avatar-row">
      <el-upload
        class="avatar-uploader"
        :show-file-list="false"
        accept="image/jpeg,image/png,image/webp"
        :disabled="uploading || !customerId"
        :before-upload="onBeforeUpload"
      >
        <div v-if="preview" class="avatar-preview-wrap">
          <img :src="preview" class="avatar-preview-img" alt="头像预览" />
          <div class="avatar-mask">更换</div>
        </div>
        <div v-else class="avatar-placeholder">
          <el-icon v-if="!uploading"><Plus /></el-icon>
          <span>{{ uploading ? '上传中…' : '上传头像' }}</span>
        </div>
      </el-upload>
      <div class="avatar-actions">
        <el-button
          v-if="modelValue || preview"
          type="danger"
          link
          :disabled="uploading"
          @click="clearAvatar"
        >
          清除头像
        </el-button>
      </div>
    </div>
    <p class="avatar-tip">{{ CUSTOMER_AVATAR_TIP }}</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { api } from '@/api/admin'
import { CUSTOMER_AVATAR_TIP, processCustomerAvatarFile } from '@/utils/customerAvatar'

const props = defineProps({
  customerId: { type: String, required: true },
  modelValue: { type: String, default: '' },
  displayUrl: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'update:displayUrl', 'change'])

const preview = ref(props.displayUrl || '')
const uploading = ref(false)

watch(
  () => props.displayUrl,
  (url) => {
    if (url) preview.value = url
    else if (!props.modelValue) preview.value = ''
  }
)

async function onBeforeUpload(file) {
  if (!props.customerId) {
    ElMessage.warning('客户信息未加载')
    return false
  }
  uploading.value = true
  try {
    const processed = await processCustomerAvatarFile(file)
    preview.value = processed.previewUrl

    const res = await api.uploadCustomerAvatar({
      id: props.customerId,
      base64: processed.base64,
      mimeType: 'image/jpeg'
    })
    emit('update:modelValue', res.avatarUrl)
    emit('update:displayUrl', res.avatarDisplayUrl || processed.previewUrl)
    emit('change')
    ElMessage.success('头像已上传，保存后生效')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    uploading.value = false
  }
  return false
}

async function clearAvatar() {
  try {
    await ElMessageBox.confirm('清除后该客户将显示称呼首字头像，确定吗？', '清除头像', {
      type: 'warning',
      confirmButtonText: '清除'
    })
    preview.value = ''
    emit('update:modelValue', '')
    emit('update:displayUrl', '')
    emit('change')
    ElMessage.success('已清除，请点击保存')
  } catch {
    /* cancel */
  }
}
</script>

<style scoped>
.customer-avatar-upload {
  width: 100%;
}

.avatar-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.avatar-uploader :deep(.el-upload) {
  border: 1px dashed var(--el-border-color);
  border-radius: 50%;
  cursor: pointer;
  overflow: hidden;
  width: 96px;
  height: 96px;
}

.avatar-preview-wrap,
.avatar-placeholder {
  width: 96px;
  height: 96px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.avatar-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 13px;
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-preview-wrap:hover .avatar-mask {
  opacity: 1;
}

.avatar-placeholder {
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #909399;
}

.avatar-actions {
  padding-top: 8px;
}

.avatar-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}
</style>
