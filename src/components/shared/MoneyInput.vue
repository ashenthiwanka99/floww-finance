<template>
  <input
    ref="inputRef"
    :value="displayValue"
    type="text"
    :inputmode="decimal ? 'decimal' : 'numeric'"
    class="money-input num"
    :class="{ 'field-error': error }"
    :placeholder="placeholder"
    @input="handleInput"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: [Number, null], default: null },
  placeholder: { type: String, default: '0' },
  error: { type: Boolean, default: false },
  decimal: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])
const inputRef = ref(null)

function formatWithCommas(num) {
  if (num === null || num === undefined || num === '') return ''
  const parts = String(num).split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

const displayValue = computed(() => {
  if (props.modelValue === null || props.modelValue === undefined) return ''
  return formatWithCommas(props.modelValue)
})

function handleInput(e) {
  const el = e.target
  const cursorPos = el.selectionStart
  const oldVal = el.value
  const oldLen = oldVal.length

  // Strip to digits and single decimal point
  let stripped = oldVal.replace(/[^0-9.]/g, '')
  // Allow only one decimal point
  const dotIdx = stripped.indexOf('.')
  if (dotIdx !== -1) {
    stripped = stripped.slice(0, dotIdx + 1) + stripped.slice(dotIdx + 1).replace(/\./g, '')
  }
  const num = stripped === '' || stripped === '.' ? null : Number(stripped)

  emit('update:modelValue', num)

  // Reformat and restore cursor
  nextTick(() => {
    const newVal = el.value
    const newLen = newVal.length
    const diff = newLen - oldLen
    const newPos = Math.max(0, cursorPos + diff)
    el.setSelectionRange(newPos, newPos)
  })
}
</script>

<style lang="scss" scoped>
.money-input {
  display: block;
  width: 100%;
  min-width: 0;
  height: var(--control-height);
  padding: 0 12px;
  border-radius: var(--radius-control);
  border: 1px solid var(--control);
  background: var(--surface);
  color: var(--text);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  outline: none;

  &::placeholder { color: var(--faint); }
  &:focus { border-color: var(--text); }
  &.field-error { border-color: var(--negative); }
}

.money-wrap .money-input {
  height: 100%;
  padding: 0;
  border: 0;
  background: none;
}
</style>
