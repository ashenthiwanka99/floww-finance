<template>
  <button class="cc" :aria-label="ariaLabel" @click="$emit('click', card)">
    <span class="cc__top">
      <span class="cc__name">{{ card.name }}</span>
      <span class="cc__network">{{ networkLabel }}</span>
    </span>
    <span class="cc__mid">
      <span class="cc__chip" aria-hidden="true"><span /></span>
      <span v-if="card.last4" class="cc__number num">••{{ card.last4 }}</span>
    </span>
    <span class="cc__bottom">
      <span>
        <span class="cc__label">Owed</span>
        <span class="cc__owed num" :class="{ 'cc__owed--zero': !card.currentOutstanding }"><span class="cc__unit">LKR</span>{{ formatMoney(card.currentOutstanding || 0) }}</span>
      </span>
      <span class="cc__due num">{{ dueText }}</span>
    </span>
    <span class="cc__track" role="img" :aria-label="`${utilPercent}% of limit used`">
      <span :class="{ over: utilPercent >= 100 }" :style="{ width: `${Math.min(100, utilPercent)}%` }" />
    </span>
    <span class="cc__meta num">{{ meta }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { format } from 'date-fns'
import { formatMoney } from '../../utils/format'
import { useCreditCardStore } from '../../stores/creditCardStore'

const props = defineProps({
  card: { type: Object, required: true }
})
defineEmits(['click'])

const cardStore = useCreditCardStore()

const NETWORKS = { visa: 'VISA', master: 'Mastercard', mastercard: 'Mastercard', amex: 'AMEX', discover: 'Discover' }
const networkLabel = computed(() => NETWORKS[props.card.network] || '')

const utilPercent = computed(() => cardStore.utilizationPercent(props.card))

// For linked cards, available reflects the shared credit line, not this
// card's own limit minus its own outstanding (which would over-report).
const available = computed(() => {
  const outstanding = props.card.creditLineId
    ? cardStore.creditLineOutstanding(props.card)
    : (props.card.currentOutstanding || 0)
  return Math.max(0, (props.card.limit || 0) - outstanding)
})

const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`

const dueText = computed(() => {
  const due = cardStore.nextDueDate(props.card)
  if (props.card.currentOutstanding > 0 && due) return `Due ${format(due, 'd MMM')}`
  return `Due on the ${ordinal(props.card.paymentDueDay)}`
})

const meta = computed(() => {
  const parts = [`${formatMoney(available.value)} available of ${formatMoney(props.card.limit || 0)}`]
  if (props.card.creditLineId) parts.push('shared limit')
  return parts.join(' · ')
})

const ariaLabel = computed(() =>
  `${props.card.name}${props.card.last4 ? ` ending ${props.card.last4}` : ''}, LKR ${formatMoney(props.card.currentOutstanding || 0)} owed, ${dueText.value.toLowerCase()}, ${meta.value}`
)
</script>

<style lang="scss" scoped>
.cc {
  display: flex;
  flex-direction: column;
  width: 100%;
  aspect-ratio: 1.586;
  padding: 16px 18px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: var(--card-face);
  color: var(--card-ink);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: transform 0.12s ease;

  &:active { transform: scale(0.985); }
}

:global(:root[data-theme='dark']) .cc { border-color: var(--border); }

.cc__top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.cc__name {
  font-size: var(--fs-body);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cc__network { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; color: var(--card-muted); flex: none; }

.cc__mid {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.cc__chip {
  width: 34px;
  height: 26px;
  border-radius: 5px;
  background: var(--card-chip);
  position: relative;
  flex: none;
  &::before, &::after, > span {
    content: '';
    position: absolute;
    background: var(--card-face);
    opacity: 0.3;
  }
  &::before { left: 0; right: 0; top: 9px; height: 1px; }
  &::after { left: 0; right: 0; bottom: 9px; height: 1px; }
  > span { top: 0; bottom: 0; left: 12px; width: 1px; }
}

.cc__number { font-size: 15px; letter-spacing: 0.08em; color: var(--card-muted); }

.cc__bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-top: auto;
}

.cc__label { display: block; font-size: var(--fs-small); color: var(--card-muted); line-height: 16px; }
.cc__owed { display: block; font-size: 24px; line-height: 30px; font-weight: 700; letter-spacing: -0.01em; }
.cc__owed--zero { color: var(--card-muted); }
.cc__unit { font-size: 0.6em; font-weight: 500; color: var(--card-muted); margin-right: 4px; letter-spacing: 0; }
.cc__due { font-size: var(--fs-small); color: var(--card-muted); line-height: 16px; padding-bottom: 4px; }

.cc__track {
  display: block;
  height: 4px;
  margin-top: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--card-ink) 16%, transparent);
  overflow: hidden;
  > span { display: block; height: 100%; background: var(--card-hue); }
  > span.over { background: var(--card-over); }
}

.cc__meta { display: block; margin-top: 6px; font-size: var(--fs-small); line-height: 16px; color: var(--card-muted); }
</style>
