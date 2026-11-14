<template>
  <div class="swipe">
    <button v-if="offsetX > 0" class="swipe__action swipe__action--done" @click="$emit('complete', loan.id)">
      <span class="material-symbols-outlined">check</span> Done
    </button>
    <button v-if="offsetX < 0" class="swipe__action swipe__action--delete" @click="$emit('deleteLoan', loan.id)">
      Delete <span class="material-symbols-outlined">delete</span>
    </button>

    <div
      class="loan"
      role="button"
      tabindex="0"
      :style="{ transform: `translateX(${offsetX}px)` }"
      @click="handleTap"
      @keydown.enter="$emit('edit', loan)"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
    >
      <div class="loan__line">
        <span class="row__title">{{ loan.name }}</span>
        <span class="row__amount num" :class="{ 'is-zero': !remainingBalance }">{{ formatMoney(remainingBalance) }}</span>
      </div>
      <div class="track loan__track" role="img" :aria-label="`${progressPct}% repaid`">
        <span class="fill--hue" :style="{ width: `${progressPct}%` }" />
      </div>
      <div class="loan__line">
        <span class="row__meta num">{{ meta }}</span>
        <span v-if="isOverdue" class="pill pill--negative">Overdue</span>
      </div>

      <div v-if="(loan.status === 'active' && remaining > 0) || paymentHistory.length" class="loan__actions">
        <button v-if="loan.status === 'active' && remaining > 0" class="btn btn--outline btn--small" @click.stop="$emit('payoff', loan.id)">
          Pay off early
        </button>
        <button v-if="paymentHistory.length" class="btn btn--ghost btn--small" :aria-expanded="historyOpen" @click.stop="historyOpen = !historyOpen">
          Payments <span class="num">{{ paymentHistory.length }}</span>
          <span class="material-symbols-outlined">{{ historyOpen ? 'expand_less' : 'expand_more' }}</span>
        </button>
      </div>

      <div v-if="historyOpen" class="loan__history" @click.stop>
        <p v-for="(p, i) in paymentHistory" :key="i" class="loan__history-row num">
          <span>{{ p.date }}</span>
          <span class="loan__history-label">{{ p.label }}</span>
          <span>{{ formatMoney(p.amount) }}</span>
        </p>
        <p v-if="lumpPayoffTotalMissing > 0" class="row__meta num">
          Plus LKR {{ formatMoney(lumpPayoffTotalMissing) }} cleared with Pay off the rest, which has no expense entry.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format, parseISO } from 'date-fns'
import { formatMoney } from '../../utils/format'
import { useFinanceStore } from '../../stores/financeStore'

const financeStore = useFinanceStore()
const historyOpen = ref(false)

const emit = defineEmits(['edit', 'complete', 'deleteLoan', 'payoff'])

// Swipe
const offsetX = ref(0)
let startX = 0, startY = 0, swiping = false, didSwipe = false

function onTouchStart(e) {
  startX = e.touches[0].clientX
  startY = e.touches[0].clientY
  swiping = false; didSwipe = false
}
function onTouchMove(e) {
  const dx = e.touches[0].clientX - startX
  const dy = e.touches[0].clientY - startY
  if (!swiping && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) swiping = Math.abs(dx) > Math.abs(dy)
  if (swiping) { e.preventDefault(); didSwipe = true; offsetX.value = Math.max(-96, Math.min(96, dx)) }
}
function onTouchEnd() {
  if (offsetX.value > 60) offsetX.value = 96
  else if (offsetX.value < -60) offsetX.value = -96
  else offsetX.value = 0
  swiping = false
}
function handleTap() {
  if (!didSwipe && offsetX.value === 0) emit('edit', props.loan)
  else if (!didSwipe) offsetX.value = 0
  didSwipe = false
}

const props = defineProps({
  loan: { type: Object, required: true },
  totalDebt: { type: Number, default: 0 }
})

// ── Source of truth: this loan's EMI rows ──
// Deriving the card's stats from the actual rows keeps them consistent after
// variable EMI payments / re-amortization (counts, due date and progress all agree).
const emiRows = computed(() => {
  const emiName = `${props.loan.name} EMI`
  return financeStore.expenses
    .filter(e =>
      e.category === 'loans' && e.isInstallment &&
      (e.loanId === props.loan.id || (!e.loanId && e.name === emiName))
    )
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
})
const pendingEmis = computed(() => emiRows.value.filter(e => e.status !== 'paid'))
const hasRows = computed(() => emiRows.value.length > 0)

const remaining = computed(() =>
  Math.max(pendingEmis.value.length, (props.loan.totalMonths || 0) - (props.loan.monthsPaid || 0), 0)
)

const remainingBalance = computed(() => {
  if (typeof props.loan.outstandingBalance === 'number') {
    return Math.max(0, props.loan.outstandingBalance)
  }
  return Math.max(0, (props.loan.totalAmount || 0) - ((props.loan.monthlyInstallment || 0) * (props.loan.monthsPaid || 0)))
})

// Money-based progress so extra payments are reflected (not just months elapsed).
const progressPct = computed(() => {
  const total = props.loan.totalAmount || 0
  if (total <= 0) return 0
  const repaid = Math.max(0, total - remainingBalance.value)
  return Math.min(100, Math.round((repaid / total) * 100))
})

const isPaidOff = computed(() => {
  if (props.loan.status === 'completed') return true
  if (hasRows.value) return pendingEmis.value.length === 0
  return (props.loan.monthsPaid || 0) >= (props.loan.totalMonths || 1)
})

// Next due date = the earliest unpaid EMI's date (no addMonths gymnastics).
const nextDueLabel = computed(() => {
  if (!nextDueStr.value) return ''
  try { return format(parseISO(nextDueStr.value), 'd MMM') } catch { return nextDueStr.value }
})

const meta = computed(() => {
  const parts = []
  if (props.loan.lender) parts.push(props.loan.lender)
  if (isPaidOff.value) {
    parts.push(`${formatMoney(props.loan.totalAmount || 0)} repaid`)
    return parts.join(' · ')
  }
  if (props.loan.monthlyInstallment) parts.push(`EMI ${formatMoney(props.loan.monthlyInstallment)}`)
  if (remaining.value > 0) parts.push(`${remaining.value} left`)
  if (nextDueLabel.value) parts.push(`next ${nextDueLabel.value}`)
  return parts.join(' · ')
})

const nextDueStr = computed(() => {
  if (pendingEmis.value.length) return pendingEmis.value[0].dueDate || null
  return props.loan.nextDueDate || null
})

// Payment history: paid EMI rows + standalone "Full Payoff" rows linked to this loan,
// sorted by date desc. EMIs labelled by installment #, lumps labelled "Lump payoff".
const paymentHistory = computed(() => {
  const emiName = `${props.loan.name} EMI`
  const rows = financeStore.expenses.filter(e =>
    e.category === 'loans' &&
    e.status === 'paid' &&
    (e.loanId === props.loan.id || (!e.loanId && (e.name === emiName || e.name === `${props.loan.name} (Full Payoff)`)))
  )
  const items = rows.map(e => {
    const isLump = !e.isInstallment
    let dateStr = '-'
    try { dateStr = format(parseISO(e.dueDate), 'd MMM yyyy') } catch {}
    return {
      kind: isLump ? 'lump' : 'emi',
      label: isLump ? 'Paid off in one go' : `EMI ${e.installmentCurrent || ''}`.trim(),
      date: dateStr,
      amount: e.amount || 0,
      sortKey: e.dueDate || ''
    }
  })
  items.sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  return items
})

// If the loan was completed via Pay-Off Remaining (new flow, no ledger row),
// the totalRepaid will exceed what's visible in paymentHistory. Surface that
// gap so the user knows their lump payment is recorded even though it has no
// expense entry.
const lumpPayoffTotalMissing = computed(() => {
  const visible = paymentHistory.value.reduce((s, p) => s + p.amount, 0)
  const repaid = props.loan.totalRepaid || 0
  return Math.max(0, repaid - visible)
})

const isOverdue = computed(() => {
  if (isPaidOff.value || !nextDueStr.value) return false
  try {
    return format(parseISO(nextDueStr.value), 'yyyy-MM-dd') < format(new Date(), 'yyyy-MM-dd')
  } catch {
    return false
  }
})
</script>

<style lang="scss" scoped>
.swipe { position: relative; overflow: hidden; }

.swipe + .swipe .loan::before {
  content: '';
  position: absolute;
  top: 0;
  left: var(--card-pad);
  right: 0;
  height: 1px;
  background: var(--rule);
}

.loan {
  position: relative;
  padding: 12px var(--card-pad);
  background: var(--surface);
  cursor: pointer;
  touch-action: pan-y;
  transition: transform 0.2s ease;
}

.loan__line { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.loan__track { margin: 8px 0 6px; height: 6px; }
.loan .row__meta { white-space: normal; }
.loan__actions { display: flex; gap: 8px; margin-top: 10px; }

.loan__history { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--rule); }
.loan__history-row {
  display: flex;
  gap: 12px;
  font-size: var(--fs-small);
  line-height: 24px;
  color: var(--muted);
  > span:last-child { margin-left: auto; color: var(--text); }
}
.loan__history-label { color: var(--muted); }

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
  color: var(--on-primary);
  cursor: pointer;
  .material-symbols-outlined { font-size: 18px; }
  &--done { left: 0; background: var(--positive); }
  &--delete { right: 0; background: var(--negative); }
}
</style>
