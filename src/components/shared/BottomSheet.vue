<template>
  <Teleport to="body">
    <div v-if="modelValue" class="sheet-overlay" @click="close" />
    <div
      v-if="modelValue"
      class="sheet-container"
      :style="{ transform: `translateY(${dragY}px)` }"
    >
      <div
        class="drag-zone"
        @touchstart="onDragStart"
        @touchmove="onDragMove"
        @touchend="onDragEnd"
      >
        <div class="drag-handle" />
      </div>
      <h3 v-if="title" class="sheet-title font-headline">{{ title }}</h3>
      <div class="sheet-scroll">
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { pushBackConsumer, popBackConsumer } from '../../utils/backGuard'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue'])

function close() {
  emit('update:modelValue', false)
}

// Back button handler — uses Capacitor App plugin for native back button
let backListener = null

let backPushed = false

async function setupBackHandler() {
  if (!backPushed) { pushBackConsumer(); backPushed = true }
  try {
    const { App } = await import('@capacitor/app')
    backListener = await App.addListener('backButton', () => {
      close()
    })
  } catch {
    // Fallback for web: no-op
  }
}

function cleanupBackHandler() {
  if (backListener) {
    backListener.remove()
    backListener = null
  }
  if (backPushed) { popBackConsumer(); backPushed = false }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    setupBackHandler()
  } else {
    cleanupBackHandler()
    dragY.value = 0
  }
})

onUnmounted(() => {
  cleanupBackHandler()
})

// Drag-to-dismiss — only from the handle zone
const dragY = ref(0)
let startY = 0
let isDragging = false

function onDragStart(e) {
  startY = e.touches[0].clientY
  isDragging = false
}

function onDragMove(e) {
  const dy = e.touches[0].clientY - startY
  if (dy > 0) {
    isDragging = true
    dragY.value = dy
    e.preventDefault()
  }
}

function onDragEnd() {
  if (isDragging && dragY.value > 100) {
    close()
  }
  dragY.value = 0
  isDragging = false
}
</script>

<style lang="scss" scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  z-index: 200;
}

.sheet-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-width: 560px;
  margin: 0 auto;
  max-height: 90vh;
  background: var(--surface);
  color: var(--text);
  border-radius: 12px 12px 0 0;
  box-shadow: var(--sheet-shadow);
  z-index: 201;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s ease;
}

.drag-zone {
  padding: 8px 0 4px;
  cursor: grab;
  touch-action: none;
  flex-shrink: 0;
}

.drag-handle {
  width: 36px;
  height: 4px;
  background: var(--control);
  border-radius: 2px;
  margin: 0 auto;
}

.sheet-title {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
  color: var(--text);
  padding: 8px 16px 4px;
  margin: 0;
  flex-shrink: 0;
}

.sheet-scroll {
  overflow-y: auto;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  flex: 1;
  -webkit-overflow-scrolling: touch;
}
</style>
