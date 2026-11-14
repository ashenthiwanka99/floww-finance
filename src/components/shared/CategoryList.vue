<template>
  <div class="list">
    <div class="share-wrap">
      <span class="share" role="img" :aria-label="shareLabel">
        <span v-for="s in share" :key="s.key" :style="{ width: `${s.pct}%`, background: s.color }" />
      </span>
    </div>
    <router-link
      v-for="(c, i) in shown"
      :key="c.key"
      :to="{ path: '/expenses', query: { category: c.key } }"
      class="row cat-row"
    >
      <span class="row__main">
        <span class="cat-row__line">
          <span class="cat-row__name">
            <span class="cat-swatch" :style="{ background: swatch(i) }" aria-hidden="true" />
            <span class="row__title">{{ categoryLabel(c.key) }}</span>
          </span>
          <span class="row__amount num" :class="{ 'is-negative': c.over }">{{ formatMoney(c.amount) }}</span>
        </span>
        <template v-if="c.limit">
          <span class="track cat-track" role="img" :aria-label="`${Math.round((c.amount / c.limit) * 100)}% of the limit`">
            <span class="fill" :class="{ 'fill--over': c.over }" :style="{ width: `${Math.min(100, (c.amount / c.limit) * 100)}%` }" />
          </span>
          <span class="row__meta num">
            {{ c.over ? `${formatMoney(c.amount - c.limit)} over the ${formatMoney(c.limit)} limit` : `${formatMoney(c.limit - c.amount)} left of ${formatMoney(c.limit)}` }}
          </span>
        </template>
      </span>
    </router-link>
    <router-link v-if="hidden.length" to="/monthly-report" class="row cat-more">
      <span class="cat-swatch" :style="{ background: swatch(4) }" aria-hidden="true" />
      <span class="row__main row__title">{{ hidden.length }} more categories</span>
      <span class="row__amount num">{{ formatMoney(hiddenTotal) }}</span>
      <span class="row__chev material-symbols-outlined">chevron_right</span>
    </router-link>
    <div class="row cat-total">
      <span class="row__main row__title">Total spending</span>
      <span class="row__amount num">{{ formatMoney(total) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatMoney } from '../../utils/format'
import { categoryLabel } from '../../utils/categoryConfig'

const props = defineProps({
  categories: { type: Array, required: true },
  total: { type: Number, required: true },
  limit: { type: Number, default: 0 }
})

const shown = computed(() => (props.limit ? props.categories.slice(0, props.limit) : props.categories))
const hidden = computed(() => props.categories.slice(shown.value.length))
const hiddenTotal = computed(() => hidden.value.reduce((s, c) => s + c.amount, 0))

const swatch = i => `var(--share-${Math.min(i, 4) + 1})`

const share = computed(() => {
  const total = props.total || 1
  const top = props.categories.slice(0, 4).map((c, i) => ({ key: c.key, amount: c.amount, color: swatch(i) }))
  const rest = props.categories.slice(4).reduce((s, c) => s + c.amount, 0)
  if (rest > 0) top.push({ key: 'rest', amount: rest, color: swatch(4) })
  return top.map(s => ({ ...s, pct: (s.amount / total) * 100 }))
})

const shareLabel = computed(() =>
  share.value.map(s => `${s.key === 'rest' ? 'Everything else' : categoryLabel(s.key)} ${Math.round(s.pct)}%`).join(', ')
)
</script>

<style lang="scss" scoped>
.share-wrap { padding: var(--card-pad) var(--card-pad) 4px; }

.share {
  display: flex;
  gap: 2px;
  height: 12px;
  border-radius: 999px;
  overflow: hidden;
  > span { display: block; height: 100%; min-width: 3px; }
}

.cat-row { min-height: 52px; }

.cat-more .row__title { font-weight: 400; color: var(--muted); }

.cat-swatch {
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 3px;
}

.cat-row__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cat-row__name {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  .row__title { min-width: 0; }
}

.cat-track {
  height: 4px;
  margin: 6px 0 2px 22px;
  .fill { background: var(--chart-muted); }
  .fill--over { background: var(--negative); }
}

.cat-row .row__meta { margin-left: 22px; }

.cat-total {
  cursor: default;
  font-weight: 600;
  &:active { background: none; }
  .row__title, .row__amount { font-weight: 600; }
}
</style>
