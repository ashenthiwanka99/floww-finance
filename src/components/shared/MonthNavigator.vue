<template>
  <div class="month-nav" :class="{ 'month-nav--heading': heading }">
    <button class="month-nav__label" :aria-label="`Choose month, ${fullLabel}`" @click="showPicker = true">
      <component :is="heading ? 'h1' : 'span'" class="month-nav__text">{{ label }}</component>
      <span class="material-symbols-outlined">expand_more</span>
    </button>
    <button v-if="!isCurrentMonth" class="btn btn--ghost btn--small" @click="jumpToToday">This cycle</button>
    <button class="icon-btn" aria-label="Previous month" @click="$emit('prev')">
      <span class="material-symbols-outlined">chevron_left</span>
    </button>
    <button class="icon-btn month-nav__next" aria-label="Next month" @click="$emit('next')">
      <span class="material-symbols-outlined">chevron_right</span>
    </button>

    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="showPicker" class="picker-overlay" @click="showPicker = false" />
      </Transition>
      <Transition name="bottom-sheet">
        <div v-if="showPicker" class="picker-sheet" role="dialog" aria-label="Choose month">
          <div class="picker-year-row">
            <button class="icon-btn" aria-label="Previous year" @click="pickerYear--">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <span class="picker-year num">{{ pickerYear }}</span>
            <button class="icon-btn" aria-label="Next year" @click="pickerYear++">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <div class="picker-grid">
            <button
              v-for="(m, i) in monthNames"
              :key="i"
              class="picker-month"
              :class="{ on: isSelected(i), now: isCurrent(i) }"
              @click="selectMonth(i)"
            >{{ m }}</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { format, parse } from 'date-fns'
import { getBudgetMonth } from '../../utils/format'

const props = defineProps({
  monthYear: { type: String, required: true },
  heading: { type: Boolean, default: false }
})

const emit = defineEmits(['prev', 'next', 'jump'])

const showPicker = ref(false)
const pickerYear = ref(new Date().getFullYear())
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const date = computed(() => parse(props.monthYear, 'yyyy-MM', new Date()))
const isCurrentMonth = computed(() => props.monthYear === getBudgetMonth())
const fullLabel = computed(() => format(date.value, 'MMMM yyyy'))
const label = computed(() =>
  date.value.getFullYear() === new Date().getFullYear() ? format(date.value, 'MMMM') : fullLabel.value
)

watch(showPicker, (open) => {
  if (open) pickerYear.value = Number(props.monthYear.slice(0, 4))
})

function isSelected(i) {
  const [y, m] = props.monthYear.split('-').map(Number)
  return y === pickerYear.value && m === i + 1
}

function isCurrent(i) {
  const [y, m] = getBudgetMonth().split('-').map(Number)
  return y === pickerYear.value && m === i + 1
}

function selectMonth(i) {
  emit('jump', `${pickerYear.value}-${String(i + 1).padStart(2, '0')}`)
  showPicker.value = false
}

function jumpToToday() {
  emit('jump', getBudgetMonth())
}
</script>

<style lang="scss" scoped>
.month-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 44px;
}

.month-nav__label {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 44px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--text);

  .material-symbols-outlined { color: var(--muted); }
}

.month-nav__text {
  font-size: var(--fs-section);
  font-weight: 500;
  white-space: nowrap;
}

.month-nav--heading .month-nav__text {
  font-size: var(--fs-title);
  line-height: 30px;
  font-weight: 600;
}

.month-nav__next { margin-right: -11px; }

.picker-overlay {
  position: fixed;
  inset: 0;
  background: var(--scrim);
  z-index: 300;
}

.picker-sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 560px;
  margin: 0 auto;
  z-index: 301;
  background: var(--surface);
  border-radius: 12px 12px 0 0;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom, 0px));
  box-shadow: var(--sheet-shadow);
}

.picker-year-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.picker-year { font-size: var(--fs-section); font-weight: 600; }

.picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.picker-month {
  height: 44px;
  border-radius: var(--radius-control);
  border: 1px solid var(--border);
  background: var(--surface);
  font-size: var(--fs-body);
  font-weight: 500;
  cursor: pointer;

  &.now { border-color: var(--text); }
  &.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
}
</style>
