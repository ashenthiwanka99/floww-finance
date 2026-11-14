<template>
  <div class="swipe">
    <button v-if="offsetX > 0" class="swipe__action swipe__action--paid" @click="$emit('markPaid', expense.id)">
      <span class="material-symbols-outlined">check</span> Mark paid
    </button>
    <button v-if="offsetX < 0" class="swipe__action swipe__action--delete" @click="$emit('delete', expense.id)">
      Delete <span class="material-symbols-outlined">delete</span>
    </button>

    <div
      class="row expense-row"
      role="button"
      tabindex="0"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @click="handleTap"
      @keydown.enter="emit('edit', expense)"
    >
      <span class="row__icon material-symbols-outlined" :class="iconClass">{{ icon }}</span>
      <span class="row__main">
        <span class="row__title">{{ expense.name }}</span>
        <span class="row__meta">{{ meta }}</span>
      </span>
      <span class="row__end row__end--stack">
        <span class="row__amount" :class="{ 'is-negative': isOverdue }">{{ formatMoney(expense.amount) }}</span>
        <span v-if="status" class="pill" :class="status.cls">{{ status.text }}</span>
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format, parseISO, differenceInCalendarDays, startOfDay } from 'date-fns'
import { formatMoney } from '../../utils/format'
import { getCategoryIcon, categoryLabel } from '../../utils/categoryConfig'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAccountsStore } from '../../stores/accountsStore'

const props = defineProps({
  expense: { type: Object, required: true },
  showDate: { type: Boolean, default: true },
  canDelete: { type: Boolean, default: true },
  showCard: { type: Boolean, default: true },
  showPaid: { type: Boolean, default: false },
  statusIcon: { type: Boolean, default: false }
})

const emit = defineEmits(['delete', 'markPaid', 'stopRecurring', 'edit'])

const settingsStore = useSettingsStore()
const accounts = useAccountsStore()

const unpaid = computed(() => props.expense.status !== 'paid' && props.expense.category !== 'lend')
const daysToDue = computed(() => (props.expense.dueDate ? differenceInCalendarDays(parseISO(props.expense.dueDate), startOfDay(new Date())) : null))
const isOverdue = computed(() => unpaid.value && (props.expense.status === 'overdue' || (daysToDue.value !== null && daysToDue.value < 0)))
const checklist = computed(() => props.statusIcon && props.expense.category !== 'lend')

const icon = computed(() => {
  if (checklist.value) return unpaid.value ? 'radio_button_unchecked' : 'check_circle'
  const cat = getCategoryIcon(props.expense.category, settingsStore.customCategories)
  if (cat.icon !== 'category') return cat.icon
  return props.expense.icon || cat.icon
})

const iconClass = computed(() => {
  if (!checklist.value) return null
  if (!unpaid.value) return 'row__icon--paid'
  return isOverdue.value ? 'row__icon--overdue' : null
})

const paidOn = computed(() => {
  const e = props.expense
  const t = e.paidAt || e.at
  if (t) return new Date(t)
  return e.dueDate ? parseISO(e.dueDate) : null
})

const meta = computed(() => {
  const e = props.expense
  const parts = [categoryLabel(e.category)]
  if (e.dueDate && (isOverdue.value || (props.showDate && !unpaid.value && !props.showPaid))) {
    const d = format(parseISO(e.dueDate), 'd MMM')
    parts.push(unpaid.value ? `Due ${d}` : d)
  }
  if (e.isInstallment && e.installmentTotal) parts.push(`${e.installmentCurrent} of ${e.installmentTotal}`)
  if (e.isRecurring && !e.isInstallment) parts.push('Monthly')
  if (e.fuelLiters) parts.push(`${e.fuelLiters} L`)
  if (e.category === 'cashWithdrawal') parts.push('ATM')
  else if (props.showCard || !e.paidByCardId) {
    const from = accounts.sourceLabel(e)
    if (from) parts.push(from)
  }
  if (e.lentTo && e.category !== 'lend') parts.push(`Lent to ${e.lentTo}`)
  if (e.category === 'lend' && e.collected) parts.push('Collected')
  if (e.splitWith) parts.push(`Split with ${e.splitWith}`)
  return parts.join(' · ')
})

const status = computed(() => {
  const e = props.expense
  if (e.category === 'lend') return null
  if (!unpaid.value) {
    if (!props.showPaid) return null
    const on = paidOn.value && !isNaN(paidOn.value) ? ` ${format(paidOn.value, 'd MMM')}` : ''
    return { text: `Paid${on}`, cls: 'pill--positive' }
  }
  const days = daysToDue.value
  if (isOverdue.value) return { text: days < 0 ? `${-days}d overdue` : 'Overdue', cls: 'pill--negative' }
  if (days === 0) return { text: 'Due today', cls: 'pill--warning' }
  if (days === 1) return { text: 'Due tomorrow', cls: 'pill--warning' }
  if (days !== null) return { text: `Due ${format(parseISO(e.dueDate), 'd MMM')}`, cls: '' }
  return { text: 'Not paid', cls: '' }
})

const offsetX = ref(0)
let startX = 0
let startY = 0
let swiping = false
let didSwipe = false

function onTouchStart(e) {
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
  swiping = false
}

function onTouchMove(e) {
  const dx = e.touches[0].clientX - startX
  const dy = e.touches[0].clientY - startY
  if (!swiping && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) swiping = Math.abs(dx) > Math.abs(dy)
  if (swiping) {
    e.preventDefault()
    didSwipe = true
    const max = props.expense.status === 'paid' ? 0 : 96
    offsetX.value = Math.max(props.canDelete ? -96 : 0, Math.min(max, dx))
  }
}

function onTouchEnd() {
  if (offsetX.value > 64) offsetX.value = 96
  else if (offsetX.value < -64) offsetX.value = -96
  else offsetX.value = 0
  swiping = false
}

function handleTap() {
  if (!didSwipe && offsetX.value === 0) emit('edit', props.expense)
  else if (!didSwipe) offsetX.value = 0
  didSwipe = false
}
</script>

<style lang="scss" scoped>
.swipe {
  position: relative;
  overflow: hidden;
}

.swipe + .swipe .row::before {
  content: '';
  position: absolute;
  top: 0;
  left: var(--card-pad);
  right: 0;
  height: 1px;
  background: var(--rule);
}

.expense-row {
  position: relative;
  background: var(--surface);
  transition: transform 0.2s ease;
  touch-action: pan-y;
}

.row__icon--paid { color: var(--positive); }
.row__icon--overdue { color: var(--negative); }

.swipe__action {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 96px;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--on-status);
  cursor: pointer;

  .material-symbols-outlined { font-size: 18px; }
  &--paid { left: 0; background: var(--positive); }
  &--delete { right: 0; background: var(--negative); }
}
</style>
