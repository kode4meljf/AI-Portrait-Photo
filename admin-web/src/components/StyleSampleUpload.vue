<template>
  <div class="style-sample-upload">
    <div class="upload-container">
      <div class="thumbnail-section">
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
        <p class="thumb-label">缩略图 540×720</p>
      </div>

      <div class="crop-section">
        <div v-if="hasHdImage" class="crop-area">
          <div
            ref="cropFrameRef"
            class="crop-frame"
            @wheel.prevent="onWheel"
          >
            <img
              v-if="useCoverPreview && hdPreviewUrl"
              :src="hdPreviewUrl"
              class="crop-image crop-image--cover"
              alt="高清预览"
            />
            <img
              v-else-if="hdPreviewUrl && cropReady"
              :src="hdPreviewUrl"
              class="crop-image"
              :style="cropImageStyle"
              @mousedown="onMouseDown"
              draggable="false"
              alt="裁剪调整"
            />
          </div>
          <div v-if="cropReady && !useCoverPreview" class="crop-controls">
            <span class="crop-controls-label">缩放</span>
            <el-slider
              v-model="zoomSlider"
              class="crop-zoom-slider"
              :min="zoomMin"
              :max="zoomMax"
              :step="0.01"
              :format-tooltip="formatZoomTooltip"
              @input="onZoomSliderInput"
            />
            <el-button size="small" text type="primary" @click="resetCropView">重置</el-button>
            <el-button
              size="small"
              type="primary"
              :loading="uploading"
              :disabled="!cropDirty || uploading"
              @click="applyThumbnail"
            >
              设为小图
            </el-button>
          </div>
          <p v-if="hdScaleHint" class="crop-hd-hint">{{ hdScaleHint }}</p>
          <p class="crop-tip">{{ cropTipText }}</p>
        </div>
        <div v-else class="crop-placeholder">
          <p class="placeholder-text">上传高清图后可调整裁剪</p>
        </div>
        <p class="frame-label">取景框 540×720</p>
      </div>
    </div>

    <p class="sample-tip">{{ STYLE_SAMPLE_TIP }}</p>
    <p v-if="croppedHint" class="sample-warn">原图比例非 3:4，已自动居中适应取景框，可缩放平移调整</p>
  </div>
</template>

<script setup>
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { api } from '@/api/admin'
import {
  STYLE_SAMPLE_TIP,
  processStyleSampleFileWithCrop,
  cropThumbnailFromImage,
  cropThumbnailToBlob,
  getDefaultCropView,
  clampCropView,
  getSourceCropSize,
  getZoomLimits,
  getHdDisplayInfo,
  getCropUiDisplayScale
} from '@/utils/styleSample'
import { uploadStyleSamplePair } from '@/utils/styleSampleDirectUpload'

const CROP_AREA_WIDTH = 270
const CROP_AREA_HEIGHT = 360

const props = defineProps({
  modelValue: { type: String, default: '' },
  displayUrl: { type: String, default: '' },
  hdModelValue: { type: String, default: '' },
  hdDisplayUrl: { type: String, default: '' },
  prompt: { type: String, default: '' },
  isCreate: { type: Boolean, default: false },
  baselineSampleFileId: { type: String, default: '' },
  baselineSampleHdFileId: { type: String, default: '' }
})

const emit = defineEmits([
  'update:modelValue',
  'update:displayUrl',
  'update:hdModelValue',
  'update:hdDisplayUrl',
  'toolbar-state'
])

const preview = ref(props.displayUrl || '')
const hdPreviewUrl = ref('')
const uploading = ref(false)
const generating = ref(false)
const revertSnapshot = ref(null)
const orphanFileIds = ref(new Set())
const cropDirty = ref(false)
const croppedHint = ref(false)
const cropReady = ref(false)
const useCoverPreview = ref(false)
const cropFrameRef = ref(null)
const loadedHdFileId = ref('')

const img = ref(null)
const offsetX = ref(0)
const offsetY = ref(0)
const zoom = ref(1)
const zoomSlider = ref(1)
const zoomMin = ref(1)
const zoomMax = ref(4)

const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragStartOffsetX = ref(0)
const dragStartOffsetY = ref(0)

const hasHdImage = computed(() => !!hdPreviewUrl.value)

const hasSampleState = computed(
  () =>
  !!(props.modelValue || props.hdModelValue || preview.value || props.displayUrl)
)

const generateButtonLabel = computed(() => {
  if (props.isCreate && !hasSampleState.value) return '生成样图'
  if (!props.isCreate && hasSampleState.value) return '重新生成样图'
  return '生成样图'
})

const canRevert = computed(() => !!revertSnapshot.value)

function emitToolbarState() {
  emit('toolbar-state', {
    generating: generating.value,
    uploading: uploading.value,
    canRevert: canRevert.value,
    generateButtonLabel: generateButtonLabel.value
  })
}

watch([generating, uploading, canRevert, generateButtonLabel], emitToolbarState, { immediate: true })

const sourceCropWidth = computed(() => {
  if (!img.value) return 0
  return getSourceCropSize(img.value, zoom.value).sourceCropWidth
})

const hdDisplayInfo = computed(() => {
  if (!img.value || useCoverPreview.value) return null
  return getHdDisplayInfo(img.value)
})

const hdScaleHint = computed(() => {
  const info = hdDisplayInfo.value
  if (!info) return ''
  const tier = info.tier ? `${info.tier} · ` : ''
  const hd = `${info.hdWidth}×${info.hdHeight}`
  const logical = `${info.logicalWidth}×${info.logicalHeight}`
  return `${tier}高清 ${hd}，默认 ${info.thumbScale}× 缩小为 ${logical}（重置恢复）`
})

const displayScale = computed(() => {
  if (!img.value || !sourceCropWidth.value) return 1
  return getCropUiDisplayScale(img.value, sourceCropWidth.value, CROP_AREA_WIDTH)
})

const cropTipText = computed(() => {
  if (useCoverPreview.value) return '高清预览加载失败，请重新上传样图'
  if (cropDirty.value) return '构图已调整，点击「设为小图」保存缩略图；「重置」恢复整图入框'
  return '拖动平移、滚轮或滑条放大；满意后点「设为小图」'
})

const cropImageStyle = computed(() => {
  if (!img.value || !sourceCropWidth.value) return {}
  const scale = displayScale.value
  const naturalW = img.value.naturalWidth || img.value.width
  const naturalH = img.value.naturalHeight || img.value.height
  return {
    width: naturalW * scale + 'px',
    height: naturalH * scale + 'px',
    left: -offsetX.value * scale + 'px',
    top: -offsetY.value * scale + 'px'
  }
})

watch(
  () => props.displayUrl,
  (url) => {
    if (url) preview.value = url
    else if (!props.modelValue) preview.value = ''
  }
)

watch(
  () => [props.hdDisplayUrl, props.hdModelValue],
  async ([url, fileId]) => {
    if (!fileId) {
      loadedHdFileId.value = ''
      hdPreviewUrl.value = ''
      img.value = null
      cropReady.value = false
      useCoverPreview.value = false
      return
    }
    if (fileId === loadedHdFileId.value && img.value && cropReady.value) return
    loadedHdFileId.value = fileId
    await loadHdForEdit(String(url || ''), String(props.displayUrl || ''), String(fileId))
  },
  { immediate: true }
)

function syncZoomLimits() {
  if (!img.value) return
  const limits = getZoomLimits(img.value)
  zoomMin.value = limits.minZoom
  zoomMax.value = limits.maxZoom
  if (zoom.value < limits.minZoom) zoom.value = limits.minZoom
  if (zoom.value > limits.maxZoom) zoom.value = limits.maxZoom
  zoomSlider.value = zoom.value
}

function applyCropView(view) {
  offsetX.value = view.offsetX
  offsetY.value = view.offsetY
  zoom.value = view.zoom
  zoomSlider.value = view.zoom
}

function applyCropFromImage(loadedImg) {
  syncZoomLimits()
  applyCropView(getDefaultCropView(loadedImg))
}

function formatZoomTooltip(val) {
  return `${Math.round(val * 100)}%`
}

function setCropViewWithFocal(nextZoom, focalX, focalY) {
  if (!img.value) return
  const oldScale = displayScale.value
  const imgX = offsetX.value + focalX / oldScale
  const imgY = offsetY.value + focalY / oldScale

  const view = clampCropView(img.value, offsetX.value, offsetY.value, nextZoom)
  const newScale = CROP_AREA_WIDTH / view.sourceCropWidth
  const nextOffsetX = imgX - focalX / newScale
  const nextOffsetY = imgY - focalY / newScale
  const clamped = clampCropView(img.value, nextOffsetX, nextOffsetY, view.zoom)

  applyCropView(clamped)
  cropDirty.value = true
  updateThumbnail()
}

function onZoomSliderInput(val) {
  if (!img.value || useCoverPreview.value) return
  setCropViewWithFocal(val, CROP_AREA_WIDTH / 2, CROP_AREA_HEIGHT / 2)
}

function onWheel(e) {
  if (!img.value || useCoverPreview.value || !cropFrameRef.value) return
  const rect = cropFrameRef.value.getBoundingClientRect()
  const focalX = e.clientX - rect.left
  const focalY = e.clientY - rect.top
  const factor = e.deltaY > 0 ? 0.92 : 1.08
  const nextZoom = Math.min(zoomMax.value, Math.max(zoomMin.value, zoom.value * factor))
  if (nextZoom === zoom.value) return
  setCropViewWithFocal(nextZoom, focalX, focalY)
}

function resetCropView() {
  if (!img.value) return
  applyCropFromImage(img.value)
  cropDirty.value = true
  updateThumbnail()
}

async function applyThumbnail() {
  if (!cropDirty.value || !img.value) return
  await uploadCroppedThumbnail()
}

async function loadHdFromDataUrl(dataUrl) {
  const loaded = await loadImageFromUrl(dataUrl, false)
  img.value = loaded
  hdPreviewUrl.value = dataUrl
  applyCropFromImage(loaded)
  cropReady.value = true
  useCoverPreview.value = false
}

async function loadHdForEdit(url, thumbUrl, hdFileId) {
  hdPreviewUrl.value = ''
  img.value = null
  cropReady.value = false
  useCoverPreview.value = false

  if (hdFileId.startsWith('cloud://')) {
    try {
      const data = await api.fetchStyleSampleImage({ fileId: hdFileId })
      const mime = data.mimeType || 'image/jpeg'
      const dataUrl = `data:${mime};base64,${data.base64}`
      await loadHdFromDataUrl(dataUrl)
      return
    } catch (e) {
      console.error('云样图代理加载失败', e)
    }
  }

  const browserUrl = resolveBrowserImageUrl(url, thumbUrl)
  if (!browserUrl.startsWith('http://') && !browserUrl.startsWith('https://')) {
    useCoverPreview.value = true
    hdPreviewUrl.value = browserUrl
    return
  }

  hdPreviewUrl.value = browserUrl
  try {
    let loaded = null
    try {
      loaded = await loadImageFromUrl(browserUrl, true)
    } catch {
      loaded = await loadImageFromUrl(browserUrl, false)
    }
    img.value = loaded
    applyCropFromImage(loaded)
    cropReady.value = true
  } catch (e) {
    console.error('加载高清图失败', e)
    useCoverPreview.value = true
  }
}

function resolveBrowserImageUrl(url, thumbUrl) {
  const u = String(url || '').trim()
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  const thumb = String(thumbUrl || '').trim()
  if (thumb.startsWith('http://') || thumb.startsWith('https://')) return thumb
  return u
}

function loadImageFromUrl(url, crossOrigin = false) {
  return new Promise((resolve, reject) => {
    const loadedImg = new Image()
    if (crossOrigin) loadedImg.crossOrigin = 'anonymous'
    loadedImg.onload = () => resolve(loadedImg)
    loadedImg.onerror = () => reject(new Error('图片加载失败'))
    loadedImg.src = url
  })
}

function onMouseDown(e) {
  if (!img.value || useCoverPreview.value) return
  e.preventDefault()
  isDragging.value = true
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  dragStartOffsetX.value = offsetX.value
  dragStartOffsetY.value = offsetY.value
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e) {
  if (!isDragging.value || !img.value) return
  const scale = displayScale.value
  const deltaX = (e.clientX - dragStartX.value) / scale
  const deltaY = (e.clientY - dragStartY.value) / scale

  const view = clampCropView(
    img.value,
    dragStartOffsetX.value - deltaX,
    dragStartOffsetY.value - deltaY,
    zoom.value
  )
  offsetX.value = view.offsetX
  offsetY.value = view.offsetY
  zoom.value = view.zoom
  zoomSlider.value = view.zoom
  cropDirty.value = true

  updateThumbnail()
}

async function uploadCroppedThumbnail() {
  if (!img.value || uploading.value) return
  uploading.value = true
  try {
    const result = cropThumbnailFromImage(img.value, offsetX.value, offsetY.value, zoom.value)
    const thumbBlob = await cropThumbnailToBlob(
      img.value,
      offsetX.value,
      offsetY.value,
      zoom.value
    )
    const res = await uploadStyleSamplePair({
      thumbBody: thumbBlob,
      mimeType: 'image/jpeg',
      thumbFilename: 'thumb.jpg'
    })
    emit('update:modelValue', res.sampleFileId)
    emit('update:displayUrl', res.sampleUrl || result.previewUrl)
    preview.value = res.sampleUrl || result.previewUrl
    cropDirty.value = false
    ElMessage.success('缩略图已更新')
  } catch (e) {
    ElMessage.error(e.message || '缩略图更新失败')
  } finally {
    uploading.value = false
  }
}

function onMouseUp() {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

function updateThumbnail() {
  if (!img.value) return
  const result = cropThumbnailFromImage(img.value, offsetX.value, offsetY.value, zoom.value)
  preview.value = result.previewUrl
}

function applySampleState(state) {
  const next = {
    sampleFileId: state.sampleFileId || '',
    sampleUrl: state.sampleUrl || '',
    sampleHdFileId: state.sampleHdFileId || '',
    sampleHdUrl: state.sampleHdUrl || ''
  }
  emit('update:modelValue', next.sampleFileId)
  emit('update:displayUrl', next.sampleUrl)
  emit('update:hdModelValue', next.sampleHdFileId)
  emit('update:hdDisplayUrl', next.sampleHdUrl)
  preview.value = next.sampleUrl
  cropDirty.value = false
  croppedHint.value = false
  if (next.sampleHdFileId) {
    loadedHdFileId.value = next.sampleHdFileId
    loadHdForEdit(next.sampleHdUrl, next.sampleUrl, next.sampleHdFileId)
  } else {
    loadedHdFileId.value = ''
    hdPreviewUrl.value = ''
    img.value = null
    cropReady.value = false
    useCoverPreview.value = false
  }
}

function isBaselineSampleFileId(fileId) {
  const id = String(fileId || '').trim()
  if (!id) return false
  return id === String(props.baselineSampleFileId || '').trim()
}

function isBaselineSampleHdFileId(fileId) {
  const id = String(fileId || '').trim()
  if (!id) return false
  return id === String(props.baselineSampleHdFileId || '').trim()
}

function trackOrphanSampleFiles(prevThumbId, prevHdId) {
  for (const fileId of [prevThumbId, prevHdId]) {
    const id = String(fileId || '').trim()
    if (!id.startsWith('cloud://')) continue
    if (isBaselineSampleFileId(id) || isBaselineSampleHdFileId(id)) continue
    orphanFileIds.value.add(id)
  }
}

async function flushOrphanSamples() {
  const fileIds = [...orphanFileIds.value]
  if (!fileIds.length) return
  orphanFileIds.value = new Set()
  try {
    await api.discardStyleSamples({ fileIds })
  } catch (e) {
    console.warn('[StyleSampleUpload] discard orphans failed', e)
  }
}

function captureSampleSnapshot() {
  if (!hasSampleState.value) return null
  return {
    sampleFileId: props.modelValue || '',
    sampleUrl: props.displayUrl || preview.value || '',
    sampleHdFileId: props.hdModelValue || '',
    sampleHdUrl: props.hdDisplayUrl || ''
  }
}

function base64ToFile(base64, mimeType, filename) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new File([bytes], filename, { type: mimeType || 'image/jpeg' })
}

async function applyGeneratedFromCloud({ sampleHdFileId, sampleHdUrl }) {
  const fetched = await api.fetchStyleSampleImage({ fileId: sampleHdFileId })
  const file = base64ToFile(
    fetched.base64,
    fetched.mimeType || 'image/jpeg',
    'seedream-sample.jpg'
  )
  const processed = await processStyleSampleFileWithCrop(file)
  img.value = processed.img
  syncZoomLimits()
  applyCropView({
    offsetX: processed.offsetX,
    offsetY: processed.offsetY,
    zoom: processed.zoom
  })
  preview.value = processed.thumbnailPreviewUrl
  hdPreviewUrl.value = sampleHdUrl || processed.hdPreviewUrl
  croppedHint.value = processed.cropped
  cropReady.value = true
  useCoverPreview.value = false

  const thumbBlob = await cropThumbnailToBlob(
    processed.img,
    processed.offsetX,
    processed.offsetY,
    processed.zoom
  )
  const res = await uploadStyleSamplePair({
    thumbBody: thumbBlob,
    sampleHdFileId,
    mimeType: 'image/jpeg',
    thumbFilename: 'seedream-thumb.jpg'
  })
  emit('update:modelValue', res.sampleFileId)
  emit('update:displayUrl', res.sampleUrl || processed.thumbnailPreviewUrl)
  emit('update:hdModelValue', res.sampleHdFileId || sampleHdFileId)
  emit('update:hdDisplayUrl', res.sampleHdUrl || sampleHdUrl || processed.hdPreviewUrl)
  loadedHdFileId.value = res.sampleHdFileId || sampleHdFileId
  cropDirty.value = false
}

async function onGenerate() {
  const promptText = String(props.prompt || '').trim()
  if (!promptText) {
    ElMessage.warning('请先填写提示词')
    return
  }
  if (generating.value || uploading.value) return

  const snapshot = captureSampleSnapshot()
  const prevThumb = props.modelValue
  const prevHd = props.hdModelValue
  generating.value = true
  try {
    const data = await api.generateStyleSample({ prompt: promptText })
    if (!data.sampleHdFileId) throw new Error('未返回高清样图')
    uploading.value = true
    await applyGeneratedFromCloud(data)
    trackOrphanSampleFiles(prevThumb, prevHd)
    revertSnapshot.value = snapshot
    ElMessage.success('样图已生成，满意后请保存')
  } catch (e) {
    ElMessage.error(e.message || '生成失败')
  } finally {
    uploading.value = false
    generating.value = false
  }
}

function onRevert() {
  if (!revertSnapshot.value) return
  trackOrphanSampleFiles(props.modelValue, props.hdModelValue)
  applySampleState(revertSnapshot.value)
  revertSnapshot.value = null
  ElMessage.info('已恢复生成前的样图')
}

async function onBeforeUpload(file) {
  revertSnapshot.value = null
  const prevThumb = props.modelValue
  const prevHd = props.hdModelValue
  uploading.value = true
  cropDirty.value = false
  croppedHint.value = false
  try {
    const processed = await processStyleSampleFileWithCrop(file)
    img.value = processed.img
    syncZoomLimits()
    applyCropView({
      offsetX: processed.offsetX,
      offsetY: processed.offsetY,
      zoom: processed.zoom
    })
    preview.value = processed.thumbnailPreviewUrl
    hdPreviewUrl.value = processed.hdPreviewUrl
    croppedHint.value = processed.cropped
    cropReady.value = true
    useCoverPreview.value = false

    const thumbBlob = await cropThumbnailToBlob(
      processed.img,
      processed.offsetX,
      processed.offsetY,
      processed.zoom
    )
    const baseName = String(file.name || 'sample').replace(/\.[^.]+$/, '')
    const res = await uploadStyleSamplePair({
      thumbBody: thumbBlob,
      hdBody: file,
      mimeType: file.type || 'image/jpeg',
      thumbFilename: `${baseName}-thumb.jpg`,
      hdFilename: file.name || 'sample.jpg'
    })
    trackOrphanSampleFiles(prevThumb, prevHd)
    emit('update:modelValue', res.sampleFileId)
    emit('update:displayUrl', res.sampleUrl || processed.thumbnailPreviewUrl)
    emit('update:hdModelValue', res.sampleHdFileId || '')
    emit('update:hdDisplayUrl', res.sampleHdUrl || processed.hdPreviewUrl)
    loadedHdFileId.value = res.sampleHdFileId || ''
    cropDirty.value = false
    ElMessage.success('风格样图已上传')
  } catch (e) {
    ElMessage.error(e.message || '上传失败')
  } finally {
    uploading.value = false
  }
  return false
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})

defineExpose({
  generateSample: onGenerate,
  revertSample: onRevert,
  flushOrphanSamples,
  generating,
  uploading,
  canRevert,
  generateButtonLabel
})
</script>

<style scoped>
.style-sample-upload {
  width: 100%;
}

.upload-container {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}

.thumbnail-section {
  flex-shrink: 0;
}

.crop-section {
  flex-shrink: 0;
}

.thumb-label,
.frame-label {
  margin: 6px 0 0;
  font-size: 11px;
  color: #909399;
  text-align: center;
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

.crop-area {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 270px;
}

.crop-frame {
  position: relative;
  width: 270px;
  height: 360px;
  border: 2px solid var(--el-color-primary);
  border-radius: 8px;
  overflow: hidden;
  background: #1a1a1a;
  cursor: grab;
}

.crop-frame:active {
  cursor: grabbing;
}

.crop-image {
  position: absolute;
  top: 0;
  left: 0;
  user-select: none;
  -webkit-user-drag: none;
}

.crop-image--cover {
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: default;
}

.crop-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.crop-controls-label {
  flex-shrink: 0;
  font-size: 12px;
  color: #606266;
}

.crop-zoom-slider {
  flex: 1;
  min-width: 0;
}

.crop-tip {
  margin: 0;
  font-size: 12px;
  color: #909399;
  line-height: 1.45;
}

.crop-hd-hint {
  margin: 0;
  font-size: 11px;
  color: #606266;
  line-height: 1.45;
}

.crop-placeholder {
  width: 270px;
  height: 360px;
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}

.placeholder-text {
  margin: 0;
  font-size: 13px;
  color: #8c939d;
}

.sample-tip {
  margin: 12px 0 0;
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
