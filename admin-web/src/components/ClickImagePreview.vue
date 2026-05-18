<template>
  <img
    v-if="src"
    :src="src"
    :alt="alt"
    class="click-preview-thumb"
    :class="thumbClass"
    @click.stop="openPreview"
  />
  <Teleport to="body">
    <Transition name="preview-fade">
      <div
        v-if="visible"
        class="click-preview-mask"
        role="dialog"
        aria-modal="true"
        @click.self="closePreview"
      >
        <img
          :src="src"
          :alt="alt"
          class="click-preview-large"
          @click.stop="closePreview"
        />
        <p class="click-preview-hint">再次点击图片关闭</p>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '预览' },
  thumbClass: { type: String, default: '' }
})

const visible = ref(false)

function openPreview() {
  visible.value = true
}

function closePreview() {
  visible.value = false
}

function onKeydown(e) {
  if (e.key === 'Escape' && visible.value) closePreview()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
.click-preview-thumb {
  display: block;
  object-fit: cover;
  border-radius: 6px;
  cursor: zoom-in;
  transition: opacity 0.2s, box-shadow 0.2s;
}
.click-preview-thumb:hover {
  opacity: 0.92;
  box-shadow: 0 0 0 2px var(--el-color-primary-light-5);
}
.click-preview-thumb.sample-preview {
  width: 56px;
  height: 75px;
}
.click-preview-thumb.thumb-preview {
  width: 56px;
  height: 56px;
}
.click-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.72);
  cursor: zoom-out;
}
.click-preview-large {
  max-width: min(92vw, 720px);
  max-height: min(86vh, 960px);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.35);
  cursor: zoom-out;
  user-select: none;
}
.click-preview-hint {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  pointer-events: none;
}
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}
.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
