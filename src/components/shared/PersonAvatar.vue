<template>
  <span class="avatar" aria-hidden="true">{{ initial }}</span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: '' }
})

const initial = computed(() => (props.name || '?').trim().charAt(0).toUpperCase())
</script>

<style lang="scss" scoped>
.avatar {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  background: var(--raised);
  color: var(--text);
}
</style>
