<template>
  <div class="style-sample-upload">
    <el-upload
      class="sample-uploader"
      :show-file-list="false"
      accept="image/jpeg,image/png,image/webp"
      :disabled="uploading"
      :before-upload="onBeforeUpload"
    >
      <div v-if="preview" class="sample-preview-wrap">
        <img :src="preview" class="sample-preview-img" alt="样图预览" />
        <div class="sample-mask">点击更换</div>
      </div>
      <div v-else class="sample-placeholder">
        <el-icon v-if="!uploading"><Plus /></el-icon>
        <span>{{ uploading ? '上传中…' : '上传风格样图' }}</span>
      </div>
    </el-upload>
    <p class="sample-tip">{{ STYLE_SAMPLE_TIP }}</p>
    <p v-if="croppedHint" class="sample-warn">已自动居中裁剪为 3:4</p>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { api } from '@/api/admin'
import { STYLE_SAMPLE_TIP, processStyleSampleFile } from '@/utils/styleSample'

const props = defineProps({
  modelValue: { type: String, default: '' },
  displayUrl: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'update:displayUrl'])

const preview = ref(props.displayUrl || '')
const uploading = ref(false)
const croppedHint = ref(false)

watch(
  () => props.displayUrl,
  (url) => {
    if (url) preview.value = url
    else if (!props.modelValue) preview.value = ''
  }
)

async function onBeforeUpload(file) {
  uploading.value = true
  croppedHint.value = false
  try {
    const processed = await processStyleSampleFile(file)
    preview.value = processed.previewUrl
    croppedHint.value = processed.cropped

    const res = await api.uploadStyleSample({
      base64: processed.base64,
      mimeType: 'image/jpeg'
    })
    emit('update:modelValue', res.sampleFileId)
    emit('update:displayUrl', res.sampleUrl || processed.previewUrl)
    ElMessage.success('风格样图已上传')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    uploading.value = false
  }
  return false
}
</script>

<style scoped>
.style-sample-upload {
  width: 100%;
}
.sample-uploader :deep(.el-upload) {
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s;
}
.sample-uploader :deep(.el-upload:hover) {
  border-color: var(--el-color-primary);
}
.sample-placeholder {
  width: 135px;
  height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #8c939d;
  font-size: 13px;
  background: #fafafa;
}
.sample-preview-wrap {
  position: relative;
  width: 135px;
  height: 180px;
}
.sample-preview-img {
  width: 135px;
  height: 180px;
  object-fit: cover;
  display: block;
}
.sample-mask {
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
.sample-preview-wrap:hover .sample-mask {
  opacity: 1;
}
.sample-tip {
  margin: 8px 0 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.45;
}
.sample-warn {
  margin: 4px 0 0;
  font-size: 12px;
  color: #e6a23c;
}
</style>
