<template>
  <q-page>
    <q-pull-to-refresh @refresh="onRefresh" color="dark">
      <PageHead title="Activity">
        <router-link to="/sms-import" class="icon-btn sms-btn" :aria-label="smsCount ? `Bank SMS, ${smsCount} new` : 'Bank SMS'">
          <span class="material-symbols-outlined">sms</span>
          <span v-if="smsCount" class="sms-btn__count num">{{ smsCount > 9 ? '9+' : smsCount }}</span>
        </router-link>
        <button class="icon-btn filter-btn" aria-label="Filter" @click="showFilterSheet = true">
          <span class="material-symbols-outlined">tune</span>
          <span v-if="activeFilterCount" class="filter-btn__count num">{{ activeFilterCount }}</span>
        </button>
      </PageHead>

      <MonthNavigator
        :month-year="financeStore.currentMonth"
        @prev="financeStore.navigateMonth(-1)"
        @next="financeStore.navigateMonth(1)"
        @jump="financeStore.jumpToMonth($event)"
      />

      <div class="kpis spend-kpis">
        <div>
          <p class="figure-label">Spent</p>
          <p class="figure num" :class="{ 'is-zero': !financeStore.totalSpent }">{{ formatMoney(financeStore.totalSpent) }}</p>
        </div>
        <div v-if="showMoneyIn">
          <p class="figure-label">{{ accounts.tracking ? 'Rupees in' : 'Came in' }}</p>
          <p class="figure num" :class="{ 'is-zero': !cameIn }">{{ formatMoney(cameIn) }}</p>
        </div>
        <div>
          <p class="figure-label">Unpaid</p>
          <p class="figure num" :class="{ 'is-zero': !unpaidTotal }">{{ formatMoney(unpaidTotal) }}</p>
        </div>
      </div>

      <div v-if="dayChart" class="panel day-panel">
        <BarChart
          :values="dayChart.values"
          :labels="dayChart.labels"
          :titles="dayChart.titles"
          :label-at="dayChart.labelAt"
          :highlight="selectedDay"
          :emphasis="dayChart.busiest"
          :summary="dayChart.summary"
          :aria-label="dayChart.aria"
          value-suffix="spent"
          selectable
          @select="selectedDay = $event"
        />
      </div>

      <div v-if="showMoneyIn" class="seg seg--block type-seg" role="group" aria-label="Show">
        <button v-for="t in typeOptions" :key="t.value" type="button" :aria-pressed="typeFilter === t.value" @click="typeFilter = t.value">{{ t.label }}</button>
      </div>

      <label class="search">
        <span class="material-symbols-outlined">search</span>
        <input v-model="searchQuery" type="search" class="input" placeholder="Search this cycle" aria-label="Search this cycle" />
        <button v-if="searchQuery" class="field-clear" aria-label="Clear search" @click="searchQuery = ''">
          <span class="material-symbols-outlined">close</span>
        </button>
      </label>

      <div v-if="activeFilterCount" class="chips spend-chips">
        <button v-if="selectedDate" class="chip on" @click="selectedDay = null">
          {{ format(parseISO(selectedDate), 'EEE d MMM') }} <span class="material-symbols-outlined">close</span>
        </button>
        <button v-if="statusFilter !== 'all'" class="chip on" @click="statusFilter = 'all'">
          {{ statusFilter === 'paid' ? 'Paid' : 'Unpaid' }} <span class="material-symbols-outlined">close</span>
        </button>
        <button v-if="paymentFilter !== 'any'" class="chip on" @click="paymentFilter = 'any'">
          {{ paymentFilterLabel }} <span class="material-symbols-outlined">close</span>
        </button>
        <button v-if="activeCategory" class="chip on" @click="activeCategory = null">
          {{ categoryLabel(activeCategory) }} <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <section v-if="toPay.length" aria-labelledby="to-pay-label">
        <p class="group-label num">
          <span id="to-pay-label">Not paid yet</span>
          <span>{{ formatMoney(toPayTotal) }}</span>
        </p>
        <div class="list">
          <ExpenseRow
            v-for="e in toPay"
            :key="e.id"
            :expense="e"
            :show-date="false"
            @delete="onDeleteExpense"
            @mark-paid="onMarkPaid"
            @edit="onEditExpense"
          />
        </div>
      </section>

      <template v-if="dayGroups.length">
        <section v-for="group in dayGroups" :key="group.key">
          <p class="group-label num">
            <span>{{ group.label }}</span>
            <span>{{ group.total ? formatMoney(group.total) : '' }}</span>
          </p>
          <div class="list">
            <template v-for="r in group.items" :key="r.key">
              <ExpenseRow
                v-if="r.kind === 'expense'"
                :expense="r.item"
                :show-date="false"
                @delete="onDeleteExpense"
                @mark-paid="onMarkPaid"
                @edit="onEditExpense"
              />
              <button v-else type="button" class="row" @click="openRecord(r)">
                <span class="row__icon material-symbols-outlined">{{ r.icon }}</span>
                <span class="row__main">
                  <span class="row__title">{{ r.title }}</span>
                  <span class="row__meta num">{{ r.meta }}</span>
                </span>
                <span class="row__end row__end--stack">
                  <span class="row__amount num">{{ r.amountText }}</span>
                  <span v-if="r.amountSub" class="row__meta num">{{ r.amountSub }}</span>
                </span>
              </button>
            </template>
          </div>
        </section>
      </template>
      <p v-else-if="toPay.length" class="empty spend-empty">Nothing paid in this cycle yet.</p>
      <p v-else-if="hasRecords" class="empty spend-empty">Nothing matches. Try another search or clear the filters.</p>
      <p v-else class="empty spend-empty">Nothing recorded in this cycle. Add an expense, money in or a move with the + button below.</p>
    </q-pull-to-refresh>

    <FilterSheet
      v-model="showFilterSheet"
      :status-filter="statusFilter"
      :payment-filter="paymentFilter"
      :category-filter="activeCategory"
      @apply="applyFilters"
    />
    <EditExpenseSheet v-model="showEditSheet" :expense="editingExpense" />
    <IncomeSheet v-model="showIncome" :income="editingIncome" />
    <TransferSheet v-model="showMove" :record="moveRecord" />
  </q-page>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parseISO, format, isToday, isYesterday, isValid } from 'date-fns'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import MonthNavigator from '../components/shared/MonthNavigator.vue'
import ExpenseRow from '../components/expenses/ExpenseRow.vue'
import { useSmsInbox } from '../composables/useSmsInbox'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'
import FilterSheet from '../components/expenses/FilterSheet.vue'
import IncomeSheet from '../components/accounts/IncomeSheet.vue'
import TransferSheet from '../components/accounts/TransferSheet.vue'
import { formatMoney, getBudgetMonth } from '../utils/format'
import { formatAmount, signedMoney } from '../utils/wallets'
import { useCloudSync } from '../composables/useCloudSync'
import { categoryLabel } from '../utils/categoryConfig'
import { useExpenseActions } from '../composables/useExpenseActions'
import PageHead from '../components/layout/PageHead.vue'
import BarChart from '../components/charts/BarChart.vue'
import { cycleBounds, dailySpending, todayIndex } from '../utils/cycleSeries'

const financeStore = useFinanceStore()
const { downloadFromCloud } = useCloudSync()
const settingsStore = useSettingsStore()
const cardStore = useCreditCardStore()
const accounts = useAccountsStore()
const router = useRouter()
const { fresh: smsFresh } = useSmsInbox()
const smsCount = computed(() => smsFresh.value.length)

const selectedDay = ref(null)

watch(() => financeStore.currentMonth, () => {
  selectedDay.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

const dayChart = computed(() => {
  const month = financeStore.currentMonth
  const b = cycleBounds(month)
  if (!b) return null
  const values = dailySpending(financeStore, month, b)
  const isCurrent = month === getBudgetMonth()
  const elapsed = isCurrent ? Math.max(1, Math.min(b.days, todayIndex(b) + 1)) : b.days
  const total = values.reduce((s, v) => s + v, 0)
  const busiest = values.indexOf(Math.max(...values))
  const summary = total > 0
    ? `Average LKR ${formatMoney(total / elapsed)} a day · most on ${format(b.dates[busiest], 'EEE d MMM')}`
    : 'Nothing spent in this cycle yet'
  return {
    values,
    dates: b.dates,
    labels: b.dates.map(d => format(d, 'd MMM')),
    titles: b.dates.map(d => format(d, 'EEE d MMM')),
    labelAt: [0, Math.round((b.days - 1) / 2), b.days - 1],
    busiest: total > 0 ? busiest : null,
    summary,
    aria: `Spending per day, ${format(b.start, 'd MMM')} to ${format(b.end, 'd MMM')}. ${summary}`
  }
})

const selectedDate = computed(() =>
  selectedDay.value !== null && dayChart.value ? format(dayChart.value.dates[selectedDay.value], 'yyyy-MM-dd') : null
)

const { markPaid: onMarkPaid, deleteExpense: onDeleteExpense } = useExpenseActions()

const searchQuery = ref('')
const activeCategory = ref(null)
const statusFilter = ref('all')
const paymentFilter = ref('any')
const typeFilter = ref('all')
const showFilterSheet = ref(false)

const typeOptions = [
  { value: 'all', label: 'All' },
  { value: 'spent', label: 'Spending' },
  { value: 'in', label: 'Money in' },
  { value: 'moves', label: 'Moves' }
]

const route = useRoute()
if (route.query.category) {
  activeCategory.value = String(route.query.category)
}
watch(() => route.query.category, (cat) => {
  if (cat) activeCategory.value = String(cat)
})
function applyFilters(filters) {
  statusFilter.value = filters.status
  paymentFilter.value = filters.payment
  activeCategory.value = filters.category
}

const activeFilterCount = computed(() => {
  let n = 0
  if (selectedDate.value) n++
  if (statusFilter.value !== 'all') n++
  if (paymentFilter.value !== 'any') n++
  if (activeCategory.value) n++
  return n
})

const paymentFilterLabel = computed(() => {
  const v = paymentFilter.value
  if (v === 'cash') return 'Cash'
  if (v === 'bank') return 'Bank'
  if (typeof v === 'string' && v.startsWith('acct:')) return accounts.getAccount(v.slice(5))?.name || 'Account'
  if (typeof v === 'string' && v.startsWith('card:')) {
    const card = cardStore.getCard(v.slice(5))
    if (!card) return 'From card'
    return card.last4 ? `${card.name} ••${card.last4}` : card.name
  }
  return ''
})

const showEditSheet = ref(false)
const editingExpense = ref(null)

function onEditExpense(expense) {
  editingExpense.value = expense
  showEditSheet.value = true
}

const unpaidTotal = computed(() => financeStore.totalPending + financeStore.currentMonthDebtPending)

const cameIn = computed(() => {
  const month = financeStore.currentMonth
  if (accounts.tracking) return accounts.cycleSummary(month).cameIn
  return financeStore.lkrMovedForMonth(month) + (Number(financeStore.monthlyIncomes?.[month]?.sideIncome) || 0)
})

const nameOf = id => accounts.getAccount(id)?.name || 'Bank'

function transferRecord(t) {
  const ends = accounts.transferEnds(t)
  const from = accounts.getAccount(ends.from)
  const to = accounts.getAccount(ends.to)
  const exchange = !!from && !!to && from.currency !== to.currency
  let title = 'Move'
  if (from?.wallet === 'usd' && to?.wallet === 'lkr') title = 'Dollars to LKR'
  else if (accounts.isExchange(t) && !from) title = 'Dollars to LKR'
  else if (to?.wallet === 'cash') title = 'Cash withdrawal'
  else if (from?.wallet === 'cash') title = 'Cash deposit'
  const path = `${from ? from.name : 'Dollars'} to ${to ? to.name : 'LKR'}`
  const amountSub = exchange || accounts.isExchange(t) ? `LKR ${formatAmount(ends.received)}` : ''
  return {
    key: `t-${t.id}`,
    kind: 'transfer',
    item: t,
    date: t.date,
    icon: exchange || accounts.isExchange(t) ? 'currency_exchange' : 'swap_horiz',
    title,
    meta: [path, t.note].filter(Boolean).join(' · '),
    amountSub,
    amountText: `${(from?.currency || (accounts.isExchange(t) ? 'USD' : 'LKR')) === 'USD' ? '$' : ''}${formatAmount(ends.sent, from?.currency || (accounts.isExchange(t) ? 'USD' : 'LKR'))}`,
    accountIds: [ends.from, ends.to],
    group: 'moves',
    search: `${title} ${path} ${t.note || ''}`
  }
}

const otherRecords = computed(() => {
  const month = financeStore.currentMonth
  const list = []
  for (const i of accounts.incomes) {
    if (i.monthYear !== month) continue
    list.push({
      key: `i-${i.id}`,
      kind: 'income',
      item: i,
      date: i.date,
      icon: i.kind === 'salary' ? 'work' : 'call_received',
      title: i.name,
      meta: [i.kind === 'salary' ? 'Salary' : 'Money in', nameOf(i.accountId), i.note].filter(Boolean).join(' · '),
      amountText: signedMoney(i.amount, i.currency),
      accountIds: [i.accountId],
      group: 'in',
      search: `${i.name} ${i.note || ''}`
    })
  }
  const mi = financeStore.monthlyIncomes?.[month]
  if (mi && !mi.incomeId && Number(mi.usdAmount) > 0 && mi.receivedDate) {
    list.push({
      key: `s-${month}`,
      kind: 'salary',
      item: mi,
      date: mi.receivedDate,
      icon: 'work',
      title: 'Salary',
      meta: ['Salary', nameOf(mi.accountId || accounts.defaultUsd?.id)].join(' · '),
      amountText: `+$${formatAmount(mi.usdAmount, 'USD')}`,
      accountIds: [mi.accountId || accounts.defaultUsd?.id],
      group: 'in',
      search: 'Salary'
    })
  }
  for (const t of financeStore.currencyTransfers || []) {
    if (t.monthYear === month) list.push(transferRecord(t))
  }
  for (const c of accounts.corrections) {
    if (c.monthYear !== month) continue
    const a = accounts.getAccount(c.accountId)
    list.push({
      key: `c-${c.id}`,
      kind: 'correction',
      item: c,
      date: c.date,
      icon: 'tune',
      title: 'Correction',
      meta: [a?.name, c.note].filter(Boolean).join(' · '),
      amountText: signedMoney(c.amount, a?.currency),
      accountIds: [c.accountId],
      search: `Correction ${c.note || ''}`,
      group: 'other'
    })
  }
  return list
})

const hasRecords = computed(() =>
  financeStore.currentMonthExpenses.some(e => !e.isAggregate) || otherRecords.value.length > 0
)

const showMoneyIn = computed(() => accounts.tracking || otherRecords.value.length > 0)

function expenseMatchesSource(e, v) {
  if (v === 'cash') return e.paidFromCash === true || e.category === 'cashWithdrawal'
  if (v === 'bank') return !e.paidFromCash && !e.paidByCardId && e.category !== 'cashWithdrawal'
  if (v.startsWith('card:')) return e.paidByCardId === v.slice(5)
  if (v.startsWith('acct:')) {
    const id = v.slice(5)
    return accounts.expenseAccountId(e) === id || e.toAccountId === id || e.collectedAccountId === id
  }
  return true
}

const filteredRecords = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const v = paymentFilter.value
  let expenses = financeStore.currentMonthExpenses.filter(e => !e.isAggregate && !e.hiddenFromList)
  if (statusFilter.value === 'paid') expenses = expenses.filter(e => e.status === 'paid')
  if (statusFilter.value === 'pending') expenses = expenses.filter(e => e.status !== 'paid')
  if (v !== 'any') expenses = expenses.filter(e => expenseMatchesSource(e, v))
  if (activeCategory.value) expenses = expenses.filter(e => e.category === activeCategory.value)
  if (selectedDate.value) expenses = expenses.filter(e => e.dueDate === selectedDate.value)
  if (q) expenses = expenses.filter(e => e.name.toLowerCase().includes(q))

  let others = otherRecords.value
  if (statusFilter.value === 'pending' || activeCategory.value) others = []
  if (v.startsWith('acct:')) others = others.filter(r => r.accountIds.includes(v.slice(5)))
  else if (v !== 'any') others = []
  if (selectedDate.value) others = others.filter(r => r.date === selectedDate.value)
  if (q) others = others.filter(r => r.search.toLowerCase().includes(q))

  const t = typeFilter.value
  const pending = e => e.status !== 'paid' && e.category !== 'lend'
  const shown = t === 'in' || t === 'moves' ? [] : expenses
  const toPayRows = shown.filter(pending).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  const expRows = shown.filter(e => !pending(e)).map(e => ({ key: `e-${e.id}`, kind: 'expense', item: e, date: e.dueDate, name: e.name }))
  const otherRows = t === 'spent' ? [] : others.filter(r => t === 'all' || r.group === t)
  const rows = [...expRows, ...otherRows]
  if (q) {
    const prefix = r => ((r.item?.name || r.title || '').toLowerCase().startsWith(q) ? 0 : 1)
    rows.sort((a, b) => prefix(a) - prefix(b))
  }
  return { toPay: toPayRows, rows: rows.sort((a, b) => (b.date || '').localeCompare(a.date || '')) }
})

const toPay = computed(() => filteredRecords.value.toPay)
const toPayTotal = computed(() => toPay.value.reduce((s, e) => s + (e.amount || 0), 0))

function dayHeading(dateStr) {
  if (!dateStr) return 'No date'
  const d = parseISO(dateStr)
  if (!isValid(d)) return 'No date'
  if (isToday(d)) return `Today, ${format(d, 'd MMM')}`
  if (isYesterday(d)) return `Yesterday, ${format(d, 'd MMM')}`
  return format(d, 'EEEE, d MMM')
}

const dayGroups = computed(() => {
  const groups = []
  let current = null
  for (const r of filteredRecords.value.rows) {
    const key = r.date || 'no-date'
    if (!current || current.key !== key) {
      current = { key, label: dayHeading(r.date), total: 0, items: [] }
      groups.push(current)
    }
    current.items.push(r)
    if (r.kind === 'expense' && !r.item.refund && !financeStore.excludedFromSpending.includes(r.item.category)) current.total += r.item.amount || 0
  }
  return groups
})

const showIncome = ref(false)
const editingIncome = ref(null)
const showMove = ref(false)
const moveRecord = ref(null)

function openRecord(r) {
  if (r.kind === 'income') {
    editingIncome.value = r.item
    showIncome.value = true
  } else if (r.kind === 'transfer') {
    moveRecord.value = { kind: 'transfer', id: r.item.id, item: r.item }
    showMove.value = true
  } else if (r.kind === 'salary') {
    router.push('/salary')
  } else if (r.kind === 'correction' && r.accountIds[0]) {
    router.push(`/accounts/${r.accountIds[0]}`)
  }
}

async function onRefresh(done) {
  try { await downloadFromCloud() } catch {}
  settingsStore.fetchFxRate()
  done()
}
</script>

<style lang="scss" scoped>
.spend-kpis { margin-top: 4px; }
.day-panel { margin-top: 8px; padding: 12px var(--card-pad); }
.type-seg { margin-top: 12px; }

.search {
  position: relative;
  display: block;
  margin-top: 12px;

  > .material-symbols-outlined {
    position: absolute;
    left: 12px;
    top: 12px;
    color: var(--muted);
    pointer-events: none;
  }
  .input { padding-left: 40px; padding-right: 40px; }
  .input::-webkit-search-cancel-button { display: none; }
}

.spend-chips { margin-top: 12px; }

.sms-btn { position: relative; }
.sms-btn__count {
  position: absolute;
  top: 6px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--hue);
  color: var(--on-hue);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
}

.filter-btn { position: relative; margin-right: -11px; }

.filter-btn__count {
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--primary);
  color: var(--on-primary);
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}

.spend-empty { margin-top: 16px; }
</style>
