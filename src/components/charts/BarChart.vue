<template>
  <div class="bars">
    <p class="bars__head num" aria-live="polite">
      <template v-if="highlight !== null && titles[highlight]">
        <span>{{ titles[highlight] }}</span>
        <span><span class="bars__value">LKR {{ formatMoney(values[highlight]) }}</span><template v-if="valueSuffix"> {{ valueSuffix }}</template></span>
      </template>
      <span v-else>{{ summary }}</span>
    </p>
    <div ref="box" class="bars__plot">
      <svg :width="width" :height="H" role="img" :aria-label="ariaLabel">
        <line v-for="t in ticks.slice(1)" :key="t" :x1="0" :x2="plotRight" :y1="y(t)" :y2="y(t)" class="bars__grid" />
        <text v-for="t in ticks" :key="`l${t}`" :x="width" :y="y(t) + 4" text-anchor="end" class="bars__tick">{{ compact(t) }}</text>
        <template v-for="(v, i) in values" :key="i">
          <rect v-if="v > 0" :x="barX(i)" :y="y(v)" :width="barW" :height="Math.max(1, y(0) - y(v))" :class="['bars__bar', { 'bars__bar--on': isOn(i) }]" />
        </template>
        <line :x1="0" :x2="plotRight" :y1="y(0)" :y2="y(0)" class="bars__base" />
        <text v-for="i in labelAt" :key="`x${i}`" :x="slotX(i) + slot / 2" :y="H - 4" :text-anchor="anchor(i)" class="bars__tick" :class="{ 'bars__tick--on': isOn(i) }">{{ labels[i] }}</text>
        <template v-if="selectable">
          <rect
            v-for="(v, i) in values"
            :key="`h${i}`"
            :x="slotX(i)"
            :y="0"
            :width="slot"
            :height="H"
            fill="transparent"
            class="bars__hit"
            role="button"
            :aria-label="`${titles[i] || labels[i]}, LKR ${formatMoney(v)}`"
            :aria-pressed="highlight === i"
            @click="$emit('select', highlight === i ? null : i)"
          />
        </template>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatMoney } from '../../utils/format'
import { niceTicks, compact } from '../../utils/chartScale'
import { useWidth } from '../../composables/useWidth'

const props = defineProps({
  values: { type: Array, required: true },
  labels: { type: Array, required: true },
  titles: { type: Array, default: () => [] },
  labelAt: { type: Array, default: null },
  highlight: { type: Number, default: null },
  emphasis: { type: Number, default: null },
  selectable: { type: Boolean, default: false },
  summary: { type: String, default: '' },
  valueSuffix: { type: String, default: '' },
  ariaLabel: { type: String, default: '' }
})
defineEmits(['select'])

const H = 124
const TOP = 8
const BOTTOM = 22
const LANE = 36

const box = ref(null)
const width = useWidth(box)

const plotRight = computed(() => width.value - LANE + 4)
const slot = computed(() => (width.value - LANE) / Math.max(1, props.values.length))
const barW = computed(() => Math.max(2, Math.min(28, slot.value * 0.64)))
const ticks = computed(() => niceTicks(Math.max(1, ...props.values), 3))
const top = computed(() => ticks.value[ticks.value.length - 1])
const labelAt = computed(() => props.labelAt || props.values.map((_, i) => i))

const slotX = i => i * slot.value
const barX = i => slotX(i) + (slot.value - barW.value) / 2
const y = v => TOP + (H - TOP - BOTTOM) * (1 - v / top.value)
const isOn = i => (props.highlight !== null ? props.highlight === i : props.emphasis === i)
const anchor = i => {
  if (props.values.length <= 8) return 'middle'
  return i === 0 ? 'start' : i === props.values.length - 1 ? 'end' : 'middle'
}
</script>

<style lang="scss" scoped>
.bars__head {
  display: flex;
  gap: 8px;
  min-height: 20px;
  font-size: var(--fs-small);
  line-height: 20px;
  color: var(--muted);
}

.bars__value { color: var(--text); font-weight: 600; }

.bars__plot { margin-top: 8px; }

svg { display: block; overflow: visible; }

.bars__grid { stroke: var(--grid); stroke-width: 1; }
.bars__base { stroke: var(--control); stroke-width: 1; }
.bars__tick { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.bars__tick--on { fill: var(--text); font-weight: 600; }
.bars__bar { fill: var(--chart-muted); transition: fill 0.15s ease; }
.bars__bar--on { fill: var(--hue); }
.bars__hit { cursor: pointer; outline: none; }
</style>
