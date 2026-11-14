<template>
  <q-page v-if="card">
    <PageHead :title="card.name" back="/credit-cards">
      <button class="icon-btn edit-btn" aria-label="Edit card" @click="showEdit = true">
        <span class="material-symbols-outlined">edit</span>
      </button>
    </PageHead>
    <p class="page-sub num">
      <template v-if="card.last4">••{{ card.last4 }} · </template>Statement on the {{ ordinal(card.statementDay) }}, due on the {{ ordinal(card.paymentDueDay) }}<template v-if="isLinked"> · shared limit</template>
    </p>

    <section class="panel panel--pad">
      <p class="figure-label">Owed{{ isLinked ? ' on the shared line' : '' }}</p>
      <p class="figure figure--lead" :class="{ 'is-zero': !lineOutstanding }"><span class="unit">LKR</span>{{ formatMoney(lineOutstanding) }}</p>
      <div class="track detail-track" role="img" :aria-label="`${utilPercent}% of limit used`">
        <span class="fill--hue" :style="{ width: `${Math.min(100, utilPercent)}%` }" />
      </div>
      <p class="detail-meta num">{{ formatMoney(available) }} available of {{ formatMoney(lineLimit) }} · {{ utilPercent }}% used</p>
      <button v-if="lineOutstanding > 0" type="button" class="btn btn--primary btn--block detail-pay" @click="showPayOff = true">
        Pay LKR {{ formatMoney(lineOutstanding) }}
      </button>
      <div class="btn-row">
        <button type="button" class="btn btn--outline" @click="showSettlement = true">{{ plan ? 'Settlement plan' : 'Set a plan' }}</button>
        <button type="button" class="btn btn--outline" @click="showInstallment = true">Buy on installment</button>
      </div>
    </section>

    <section v-if="lineOutstanding > 0 || plan" class="section">
      <div class="section-head"><h2>Next settlement</h2></div>
      <div class="kpis">
        <div>
          <p class="figure-label">Due</p>
          <p class="figure num">{{ nextSettlementLabel }}</p>
          <p class="figure-label">{{ plan ? planStrategyLabel : 'No plan set' }}</p>
        </div>
        <div>
          <p class="figure-label">{{ plan ? 'Planned' : 'Full balance' }}</p>
          <p class="figure num">{{ formatMoney(plannedAmt) }}</p>
        </div>
        <div>
          <p class="figure-label">Minimum</p>
          <p class="figure num">{{ formatMoney(minPayment) }}</p>
          <p class="figure-label num">{{ card.minPaymentPercent || 5 }}% of owed</p>
        </div>
      </div>
      <p v-if="carryWarning" class="notice notice--warning detail-notice">
        <span class="material-symbols-outlined">warning</span>
        <span class="num">LKR {{ formatMoney(lineOutstanding) }} is still owed. Clear it before {{ nextSettlementLabel }}.</span>
      </p>
    </section>

    <section v-if="installmentPlans.length" class="section">
      <div class="section-head"><h2>Installment plans</h2></div>
      <div class="list">
        <div v-for="p in installmentPlans" :key="p.id" class="row plan-row">
          <span class="row__main">
            <span class="plan-row__line">
              <span class="row__title">{{ p.name }}</span>
              <span class="row__amount num">{{ formatMoney(p.remaining) }}</span>
            </span>
            <span class="track plan-row__track"><span class="fill" :style="{ width: p.progressPct + '%' }" /></span>
            <span class="row__meta num">{{ p.paidCount }} of {{ p.months }} paid · {{ formatMoney(p.monthlyAmount) }} a month · {{ formatMoney(p.totalAmount) }} total</span>
          </span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Charges this cycle</h2>
        <span v-if="currentStatementCharges.length" class="num head-figure">{{ formatMoney(currentStatementCharges.reduce((s, e) => s + (e.amount || 0), 0)) }}</span>
      </div>
      <div v-if="currentStatementCharges.length" class="list">
        <ExpenseRow v-for="e in currentStatementCharges" :key="e.id" :expense="e" :can-delete="false" :show-card="false" @edit="editExpense" />
      </div>
      <p v-else class="empty">No charges on this card in {{ formatStatementRange() }}.</p>
    </section>

    <section v-if="spendingByCategory.length" class="section">
      <div class="section-head"><h2>Spent on this card</h2></div>
      <div class="list">
        <div v-for="(row, i) in spendingByCategory" :key="row.category" class="row cat-row">
          <span class="row__main">
            <span class="plan-row__line">
              <span class="row__title">{{ categoryLabel(row.category) }}</span>
              <span class="row__amount num">{{ formatMoney(row.total) }}</span>
            </span>
            <span class="thin-bar"><span :style="{ width: (row.total / spendingByCategory[0].total) * 100 + '%', background: i === 0 ? 'var(--text)' : '' }" /></span>
          </span>
        </div>
      </div>
    </section>

    <section v-if="settlementHistory.length" class="section">
      <div class="section-head">
        <h2>Payments</h2>
        <span class="num head-figure">{{ onTimeStats.onTime }} of {{ onTimeStats.total }} on time</span>
      </div>
      <div class="list">
        <div v-for="p in settlementHistory" :key="p.id" class="row">
          <span class="row__main">
            <span class="row__title num">{{ formatShortDate(p.dueDate) }}</span>
            <span class="row__meta">{{ settlementTypeLabel[p.settlementType] || 'Payment' }}</span>
          </span>
          <span class="row__end">
            <span class="row__amount num">{{ formatMoney(p.amount) }}</span>
            <span v-if="!p.onTime" class="pill pill--negative">Late</span>
          </span>
        </div>
      </div>
      <p class="group-label num"><span>Paid in total</span><span>{{ formatMoney(card.totalPaid || 0) }}</span></p>
    </section>

    <section v-if="statementHistory.length" class="section">
      <div class="section-head"><h2>Charged and paid by month</h2></div>
      <div class="list">
        <div v-for="s in statementHistory" :key="s.month" class="row">
          <span class="row__main">
            <span class="row__title">{{ s.label }}</span>
            <span class="row__meta num">Paid {{ formatMoney(s.payments) }}</span>
          </span>
          <span class="row__end">
            <span class="row__amount num">{{ formatMoney(s.charges) }}</span>
            <span class="row__meta">charged</span>
          </span>
        </div>
      </div>
    </section>

    <EditCardSheet v-model="showEdit" :card="card" @deleted="$router.replace('/credit-cards')" />
    <PayOffCardSheet v-model="showPayOff" :card="card" />
    <SettlementPlanSheet v-model="showSettlement" :card="card" />
    <CardInstallmentSheet v-model="showInstallment" :card="card" />
    <EditExpenseSheet v-model="showEditExpense" :expense="editingExpense" />
  </q-page>
  <q-page v-else>
    <PageHead title="Card not found" back="/credit-cards" />
    <p class="empty">This card was deleted or never synced to this phone.</p>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { format, parseISO, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { formatMoney } from '../utils/format'
import { categoryLabel } from '../utils/categoryConfig'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useFinanceStore } from '../stores/financeStore'

import PageHead from '../components/layout/PageHead.vue'
import ExpenseRow from '../components/expenses/ExpenseRow.vue'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'
import EditCardSheet from '../components/creditCards/EditCardSheet.vue'
import PayOffCardSheet from '../components/creditCards/PayOffCardSheet.vue'
import SettlementPlanSheet from '../components/creditCards/SettlementPlanSheet.vue'
import CardInstallmentSheet from '../components/creditCards/CardInstallmentSheet.vue'

const route = useRoute()
const cardStore = useCreditCardStore()
const financeStore = useFinanceStore()

const showEdit = ref(false)
const showPayOff = ref(false)
const showSettlement = ref(false)
const showInstallment = ref(false)
const showEditExpense = ref(false)
const editingExpense = ref(null)

function editExpense(e) {
  editingExpense.value = e
  showEditExpense.value = true
}

const card = computed(() => cardStore.getCard(route.params.cardId))

// Linked-card awareness: all reports operate over the whole credit line.
const isLinked = computed(() => !!card.value?.creditLineId)
const lineOutstanding = computed(() => card.value ? cardStore.creditLineOutstanding(card.value) : 0)
const lineLimit = computed(() => card.value ? (cardStore.creditLineLimit(card.value) || card.value.limit || 0) : 0)
const available = computed(() => Math.max(0, lineLimit.value - lineOutstanding.value))
const plan = computed(() => card.value ? cardStore.getSettlementPlan(card.value) : null)
const plannedAmt = computed(() => card.value ? cardStore.plannedAmount(card.value) : 0)
const settlementDay = computed(() => plan.value?.settlementDay || card.value?.paymentDueDay || 27)
const minPayment = computed(() =>
  Math.round(lineOutstanding.value * ((card.value?.minPaymentPercent || 5) / 100))
)
const planStrategyLabel = computed(() => {
  if (!plan.value) return 'No plan'
  const s = plan.value.strategy
  return s === 'custom' ? `Custom, LKR ${formatMoney(plan.value.customAmount || 0)}` : `Pay ${s}`
})
const nextSettlement = computed(() => card.value ? cardStore.nextSettlementDate(card.value) : null)
const nextSettlementLabel = computed(() =>
  nextSettlement.value ? format(nextSettlement.value, 'd MMM') : `Day ${settlementDay.value}`
)
const carryWarning = computed(() => {
  if (!plan.value || lineOutstanding.value <= 0) return false
  const today = new Date()
  return today.getDate() > settlementDay.value
})

const installmentPlans = computed(() => {
  if (!card.value) return []
  return cardStore.cardInstallmentPlansFor(card.value).map(p => {
    const emis = financeStore.expenses.filter(e => e.cardInstallmentPlanId === p.id && e.category === 'creditCardPayment')
    const paidCount = emis.filter(e => e.status === 'paid').length
    const remaining = Math.max(0, p.totalAmount - emis.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount || 0), 0))
    return {
      ...p,
      paidCount,
      remaining,
      progressPct: p.months ? Math.round((paidCount / p.months) * 100) : 0
    }
  })
})

const utilPercent = computed(() => card.value ? cardStore.utilizationPercent(card.value) : 0)

// Charges + payments scoped to JUST this card — even when it shares a credit
// line with siblings. The line-wide totals (outstanding, available limit,
// utilization) still come from the store; this is purely the activity ledger
// so the user sees exactly what they swiped on this specific card.
const allChargeExpenses = computed(() => {
  if (!card.value) return []
  const cardId = card.value.id
  return financeStore.expenses
    .filter(e => e.paidByCardId === cardId && e.status === 'paid')
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))
})

const allPaymentExpenses = computed(() => {
  if (!card.value) return []
  const cardId = card.value.id
  return financeStore.expenses
    .filter(e => e.category === 'creditCardPayment' && e.cardId === cardId && e.status === 'paid')
})

function dayIn(year, month, day) {
  const last = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, last))
}

function paidOnTime(paid) {
  const statementDay = Number(card.value?.statementDay) || 0
  const dueDay = Number(card.value?.paymentDueDay) || settlementDay.value
  if (!statementDay || !dueDay) return true
  let statement = dayIn(paid.getFullYear(), paid.getMonth(), statementDay)
  if (statement > paid) statement = dayIn(paid.getFullYear(), paid.getMonth() - 1, statementDay)
  let due = dayIn(statement.getFullYear(), statement.getMonth(), dueDay)
  if (due <= statement) due = dayIn(statement.getFullYear(), statement.getMonth() + 1, dueDay)
  return paid <= due
}

// Settlement history with on-time classification (paid on/before settlementDay of its cycle)
const settlementHistory = computed(() =>
  allPaymentExpenses.value
    .slice()
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))
    .map(e => {
      let onTime = true
      try {
        onTime = paidOnTime(parseISO(e.dueDate))
      } catch { onTime = true }
      return {
        id: e.id,
        dueDate: e.dueDate,
        amount: e.amount || 0,
        settlementType: e.settlementType || 'custom',
        onTime
      }
    })
)

const onTimeStats = computed(() => {
  const list = settlementHistory.value
  const total = list.length
  const onTime = list.filter(p => p.onTime).length
  return { total, onTime }
})

// Spending by category for the line (charges only, excludes creditCardPayment)
const spendingByCategory = computed(() => {
  const map = {}
  let grand = 0
  for (const e of allChargeExpenses.value) {
    const cat = e.category || 'others'
    map[cat] = (map[cat] || 0) + (e.amount || 0)
    grand += e.amount || 0
  }
  return Object.entries(map)
    .map(([category, total]) => ({ category, total, pct: grand ? Math.round((total / grand) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
})

// Current statement = paid charges on this card in the current BUDGET month
// (same `monthYear` field the rest of the app uses, with the salary-cycle rule).
// Switched from a statementDay-based cycle window because mixing two
// different "current cycle" definitions in one app was confusing — every
// other dashboard/list view scopes by monthYear, so the statement does too.
const currentStatementCharges = computed(() => {
  if (!card.value) return []
  const cm = financeStore.currentMonth
  return allChargeExpenses.value.filter(e => e.monthYear === cm)
})

function formatStatementRange() {
  const cm = financeStore.currentMonth
  if (!cm) return ''
  try {
    const [y, m] = cm.split('-').map(Number)
    return format(new Date(y, m - 1, 1), 'MMMM yyyy')
  } catch {
    return cm
  }
}

// Statement history: last 12 months, grouped by calendar month
const statementHistory = computed(() => {
  if (!card.value) return []
  const today = new Date()
  const out = []
  for (let i = 1; i <= 12; i++) {
    const monthDate = subMonths(today, i)
    const start = startOfMonth(monthDate)
    const end = endOfMonth(monthDate)
    const charges = allChargeExpenses.value
      .filter(e => {
        if (!e.dueDate) return false
        try {
          const d = parseISO(e.dueDate)
          return d >= start && d <= end
        } catch { return false }
      })
      .reduce((s, e) => s + (e.amount || 0), 0)
    const payments = allPaymentExpenses.value
      .filter(e => {
        if (!e.dueDate) return false
        try {
          const d = parseISO(e.dueDate)
          return d >= start && d <= end
        } catch { return false }
      })
      .reduce((s, e) => s + (e.amount || 0), 0)
    if (charges > 0 || payments > 0) {
      out.push({
        month: format(monthDate, 'yyyy-MM'),
        label: format(monthDate, 'MMMM yyyy'),
        charges, payments
      })
    }
  }
  return out
})

const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`

const settlementTypeLabel = { full: 'Paid in full', half: 'Paid half', min: 'Paid the minimum', custom: 'Custom amount' }

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  try { return format(parseISO(dateStr), 'd MMM') } catch { return dateStr }
}
</script>

<style lang="scss" scoped>
.edit-btn { margin-right: -11px; }
.detail-track { margin-top: 12px; }
.detail-meta { margin-top: 8px; color: var(--muted); }
.detail-pay { margin-top: 16px; }
.detail-notice { margin-top: 8px; }
.head-figure { font-size: var(--fs-body); color: var(--muted); }
.plan-row, .cat-row { cursor: default; &:active { background: none; } }
.plan-row__line { display: flex; justify-content: space-between; gap: 12px; }
.plan-row__track { margin: 8px 0 6px; height: 6px; }
</style>
