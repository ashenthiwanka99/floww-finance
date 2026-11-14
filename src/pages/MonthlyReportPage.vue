<template>
  <q-page>
    <PageHead title="Monthly report" back>
      <button class="icon-btn report-share" aria-label="Share report" @click="handleExport">
        <span class="material-symbols-outlined">ios_share</span>
      </button>
    </PageHead>

    <MonthNavigator
      :month-year="store.currentMonth"
      @prev="store.navigateMonth(-1)"
      @next="store.navigateMonth(1)"
      @jump="store.jumpToMonth($event)"
    />

    <div class="kpis">
      <div>
        <p class="figure-label">{{ accounts.tracking ? 'Rupees in' : 'Moved in' }}</p>
        <p class="figure num" :class="{ 'is-zero': !moved }">{{ formatMoney(moved) }}</p>
      </div>
      <div>
        <p class="figure-label">Paid out</p>
        <p class="figure num" :class="{ 'is-zero': !out }">{{ formatMoney(out) }}</p>
      </div>
      <div>
        <p class="figure-label">{{ accounts.tracking ? 'Net' : 'Left' }}</p>
        <p class="figure num" :class="{ 'is-zero': left === 0 }">{{ formatMoney(left) }}</p>
      </div>
    </div>
    <p v-if="accounts.tracking" class="report-finding">Paid out is everything that left your LKR wallet and cash, including loan and card payments. Spending below counts only purchases and bills.</p>
    <p v-if="biggestExpense" class="report-finding num">
      Biggest spend: {{ biggestExpense.name }}, LKR {{ formatMoney(biggestExpense.amount) }} on {{ formatDate(biggestExpense.dueDate) }}
    </p>

    <section class="section">
      <div class="section-head"><h2>Spending by cycle</h2></div>
      <div class="panel cycles-panel">
        <BarChart
          :values="cycles.values"
          :labels="cycles.labels"
          :titles="cycles.titles"
          :emphasis="cycles.values.length - 1"
          :summary="cycles.summary"
          :aria-label="`Total spending in the last ${cycles.values.length} cycles. ${cycles.summary}`"
        />
      </div>
    </section>

    <section v-if="loanReceived > 0 || debtRepaid > 0" class="section">
      <div class="section-head"><h2>Debt this cycle</h2></div>
      <div class="list">
        <div v-if="loanReceived > 0" class="row row--static">
          <span class="row__main row__title">Borrowed</span>
          <span class="row__end row__amount num">+{{ formatMoney(loanReceived) }}</span>
        </div>
        <div v-if="debtRepaid > 0" class="row row--static">
          <span class="row__main row__title">Repaid</span>
          <span class="row__end row__amount num">{{ formatMoney(debtRepaid) }}</span>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Where it went</h2>
        <router-link to="/budget-limits">Limits</router-link>
      </div>
      <CategoryList v-if="categories.length" :categories="categories" :total="spentTotal" />
      <p v-else class="empty">No spending recorded in this cycle.</p>
    </section>

    <section v-if="comparison.length" class="section">
      <div class="section-head">
        <h2>Against last cycle</h2>
        <span class="num head-figure">was {{ formatMoney(prevTotal) }}</span>
      </div>
      <div class="list">
        <div v-for="c in comparison" :key="c.key" class="row row--static">
          <span class="row__main">
            <span class="row__title">{{ categoryLabel(c.key) }}</span>
            <span class="row__meta num">Last cycle {{ formatMoney(c.before) }}</span>
          </span>
          <span class="row__end">
            <span class="row__amount num" :class="{ 'is-zero': !c.now }">{{ formatMoney(c.now) }}</span>
            <span class="row__meta num">{{ c.isNew ? 'new' : signed(c.change) }}</span>
          </span>
        </div>
      </div>
    </section>
  </q-page>
</template>

<script setup>
import { computed } from 'vue'
import { format, parseISO } from 'date-fns'
import { showToast } from '../utils/toast'
import { useMonthlyReport } from '../composables/useMonthlyReport'
import { useFinanceStore } from '../stores/financeStore'
import { useAccountsStore } from '../stores/accountsStore'
import { formatMoney } from '../utils/format'
import { categoryLabel } from '../utils/categoryConfig'
import PageHead from '../components/layout/PageHead.vue'
import MonthNavigator from '../components/shared/MonthNavigator.vue'
import BarChart from '../components/charts/BarChart.vue'
import CategoryList from '../components/shared/CategoryList.vue'
import { previousMonth } from '../utils/cycleSeries'

const store = useFinanceStore()
const accounts = useAccountsStore()
const { monthLabel, categories, spentTotal, comparison, prevTotal, biggestExpense } = useMonthlyReport()

const summary = computed(() => (accounts.tracking ? accounts.cycleSummary(store.currentMonth) : null))
const moved = computed(() => (summary.value ? summary.value.cameIn : store.totalAvailable))
const out = computed(() => (summary.value ? summary.value.wentOut : store.totalAvailable - store.monthlyClearBalance))
const left = computed(() => moved.value - out.value)
const loanReceived = computed(() => store.currentMonthLoanReceived || 0)
const debtRepaid = computed(() => store.currentMonthDebtRepaid || 0)

const cycles = computed(() => {
  const months = [store.currentMonth]
  while (months.length < 6) months.unshift(previousMonth(months[0]))
  const values = months.map(m =>
    store.expenses
      .filter(e => e.monthYear === m && e.status === 'paid' && !store.excludedFromSpending.includes(e.category))
      .reduce((s, e) => s + (e.amount || 0), 0)
  )
  const first = values.findIndex(v => v > 0)
  const shown = first === -1 ? months.length - 1 : Math.min(first, months.length - 1)
  const keep = months.slice(shown)
  const vals = values.slice(shown)
  const earlier = vals.slice(0, -1).filter(v => v > 0)
  const avg = earlier.length ? earlier.reduce((s, v) => s + v, 0) / earlier.length : 0
  const now = vals[vals.length - 1]
  const summary = avg
    ? `${Math.abs(Math.round(((now - avg) / avg) * 100))}% ${now > avg ? 'above' : 'below'} the average of the ${earlier.length} cycle${earlier.length === 1 ? '' : 's'} before`
    : 'The first cycle with spending recorded'
  return {
    values: vals,
    labels: keep.map(m => format(parseISO(`${m}-01`), 'MMM')),
    titles: keep.map(m => format(parseISO(`${m}-01`), 'MMMM yyyy')),
    summary
  }
})

function signed(n) {
  if (!n) return 'no change'
  return `${n > 0 ? '+' : '-'}${formatMoney(Math.abs(n))}`
}

function formatDate(d) {
  return d ? format(parseISO(d), 'd MMM') : ''
}

function handleExport() {
  const lines = [
    `Floww report, ${monthLabel.value}`,
    '',
    `${accounts.tracking ? 'Rupees in' : 'Moved in'}: LKR ${formatMoney(moved.value)}`,
    `Paid out: LKR ${formatMoney(out.value)}`,
    `${accounts.tracking ? 'Net' : 'Left'}: LKR ${formatMoney(left.value)}`,
    `Total spending: LKR ${formatMoney(spentTotal.value)}`,
    '',
    'By category:',
    ...categories.value.map(c => `  ${categoryLabel(c.key)}: LKR ${formatMoney(c.amount)}`),
    '',
    biggestExpense.value ? `Biggest spend: ${biggestExpense.value.name}, LKR ${formatMoney(biggestExpense.value.amount)}` : ''
  ].filter(Boolean).join('\n')

  if (navigator.share) {
    navigator.share({ title: `Floww report ${monthLabel.value}`, text: lines }).catch(() => {})
  } else {
    navigator.clipboard.writeText(lines).then(() => showToast('Report copied'))
  }
}
</script>

<style lang="scss" scoped>
.report-share { margin-right: -11px; }

.kpis { margin-top: 4px; }

.report-finding {
  margin-top: 12px;
  color: var(--muted);
}

.cycles-panel { padding: 12px var(--card-pad); }

.row--static {
  cursor: default;
  &:active { background: none; }
}

.row__end {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.head-figure { font-size: var(--fs-body); color: var(--muted); }
</style>
