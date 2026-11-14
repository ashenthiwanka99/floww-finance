<template>
  <div class="pace">
    <p class="pace__head num" aria-live="polite">
      <template v-if="active === null">
        <span class="pace__key"><span class="pace__swatch pace__swatch--now" />{{ currentLabel }}</span>
        <span v-if="previous" class="pace__key"><span class="pace__swatch pace__swatch--then" />{{ previousLabel }}</span>
      </template>
      <template v-else>
        <span class="pace__read">{{ readout.date }}</span>
        <span class="pace__read pace__read--now">{{ readout.now }}</span>
        <span v-if="readout.then !== null" class="pace__read">{{ previousLabel.toLowerCase() }} {{ readout.then }}</span>
      </template>
    </p>
    <div ref="box" class="pace__plot">
      <svg :width="width" :height="H" role="img" :aria-label="ariaLabel">
        <line v-for="t in ticks.slice(1)" :key="t" :x1="0" :x2="plotRight" :y1="y(t)" :y2="y(t)" class="pace__grid" />
        <line :x1="0" :x2="plotRight" :y1="y(0)" :y2="y(0)" class="pace__base" />
        <text v-for="t in ticks" :key="`l${t}`" :x="width" :y="y(t) + 4" text-anchor="end" class="pace__tick">{{ compact(t) }}</text>
        <text v-for="i in xLabelAt" :key="`x${i}`" :x="x(i)" :y="H - 4" :text-anchor="i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'" class="pace__tick">{{ format(dates[i], 'd MMM') }}</text>

        <polyline v-if="previous" :points="points(previous)" class="pace__then" />
        <polygon v-if="current.length > 1" :points="area" class="pace__area" />
        <polyline v-if="current.length > 1" :points="points(current)" class="pace__now" />
        <circle v-if="current.length" :cx="x(last)" :cy="y(current[last])" r="4" class="pace__dot" />

        <template v-if="active !== null">
          <line :x1="x(active)" :x2="x(active)" :y1="TOP" :y2="y(0)" class="pace__cursor" />
          <circle v-if="previous && active < previous.length" :cx="x(active)" :cy="y(previous[active])" r="3.5" class="pace__dot pace__dot--then" />
          <circle v-if="active <= last" :cx="x(active)" :cy="y(current[active])" r="3.5" class="pace__dot" />
        </template>

        <rect
          :width="width"
          :height="H"
          fill="transparent"
          class="pace__hit"
          @pointerdown="scrub"
          @pointermove="scrub"
          @pointerup="active = null"
          @pointerleave="active = null"
          @pointercancel="active = null"
        />
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format } from 'date-fns'
import { formatMoney } from '../../utils/format'
import { niceTicks, compact } from '../../utils/chartScale'
import { useWidth } from '../../composables/useWidth'

const props = defineProps({
  dates: { type: Array, required: true },
  current: { type: Array, required: true },
  previous: { type: Array, default: null },
  currentLabel: { type: String, default: 'This cycle' },
  previousLabel: { type: String, default: 'Last cycle' }
})

const H = 156
const TOP = 8
const BOTTOM = 22
const LANE = 36
const INSET = 4

const box = ref(null)
const width = useWidth(box)
const active = ref(null)

const n = computed(() => props.dates.length)
const last = computed(() => props.current.length - 1)
const plotRight = computed(() => width.value - LANE + 4)
const max = computed(() => Math.max(1, ...props.current, ...(props.previous || [])))
const ticks = computed(() => niceTicks(max.value, 3))
const top = computed(() => ticks.value[ticks.value.length - 1])

const x = i => INSET + (n.value > 1 ? (i / (n.value - 1)) * (width.value - LANE - INSET * 2) : 0)
const y = v => TOP + (H - TOP - BOTTOM) * (1 - v / top.value)
const points = series => series.slice(0, n.value).map((v, i) => `${x(i)},${y(v)}`).join(' ')
const area = computed(() => `${x(0)},${y(0)} ${points(props.current)} ${x(last.value)},${y(0)}`)
const xLabelAt = computed(() => (n.value > 2 ? [0, Math.round((n.value - 1) / 2), n.value - 1] : [0]))

function scrub(e) {
  if (e.type === 'pointermove' && e.pointerType !== 'mouse' && active.value === null) return
  const rect = e.currentTarget.getBoundingClientRect()
  const span = width.value - LANE - INSET * 2
  const i = Math.round(((e.clientX - rect.left - INSET) / span) * (n.value - 1))
  active.value = Math.max(0, Math.min(n.value - 1, i))
}

const readout = computed(() => {
  const i = active.value
  return {
    date: format(props.dates[i], 'd MMM'),
    now: i <= last.value ? formatMoney(props.current[i]) : '-',
    then: props.previous && i < props.previous.length ? formatMoney(props.previous[i]) : null
  }
})

const ariaLabel = computed(() => {
  const now = props.current[last.value] || 0
  const then = props.previous?.[Math.min(last.value, props.previous.length - 1)]
  return `${props.currentLabel}: LKR ${formatMoney(now)} spent${then !== undefined ? `, ${props.previousLabel.toLowerCase()} LKR ${formatMoney(then)} by the same day` : ''}`
})
</script>

<style lang="scss" scoped>
.pace__head {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  min-height: 20px;
  font-size: var(--fs-small);
  line-height: 20px;
  color: var(--muted);
}

.pace__key { display: inline-flex; align-items: center; gap: 6px; }

.pace__swatch {
  width: 14px;
  height: 2px;
  border-radius: 1px;
  &--now { background: var(--hue); height: 3px; }
  &--then { background: var(--chart-muted); }
}

.pace__read--now { color: var(--text); font-weight: 600; }

.pace__plot { margin-top: 8px; }

svg { display: block; overflow: visible; }

.pace__grid { stroke: var(--grid); stroke-width: 1; }
.pace__base { stroke: var(--control); stroke-width: 1; }
.pace__tick { font-size: 11px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.pace__then { fill: none; stroke: var(--chart-muted); stroke-width: 1.5; stroke-linejoin: round; }
.pace__now { fill: none; stroke: var(--hue); stroke-width: 2.25; stroke-linejoin: round; stroke-linecap: round; }
.pace__area { fill: var(--hue); fill-opacity: 0.1; stroke: none; }
.pace__dot { fill: var(--hue); stroke: var(--surface); stroke-width: 2; }
.pace__dot--then { fill: var(--chart-muted); }
.pace__cursor { stroke: var(--control); stroke-width: 1; }
.pace__hit { touch-action: pan-y; cursor: crosshair; }
</style>
