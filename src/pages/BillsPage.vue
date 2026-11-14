<template>
  <q-page>
    <header class="page-head">
      <h1>Bills</h1>
    </header>
    <p class="page-sub num">
      <template v-if="unpaidTotal > 0">LKR {{ formatMoney(unpaidTotal) }} to pay in the next 45 days<template v-if="overdueItems.length">, {{ overdueItems.length }} overdue</template></template>
      <template v-else>Nothing to pay in the next 45 days</template>
    </p>

    <div class="seg seg--block bills-seg" role="group" aria-label="View">
      <button :aria-pressed="tab === 'pay'" @click="tab = 'pay'">To pay <span class="num">{{ unpaid.length }}</span></button>
      <button :aria-pressed="tab === 'paid'" @click="tab = 'paid'">Paid <span class="num">{{ paidBills.length }}</span></button>
      <button :aria-pressed="tab === 'repeat'" @click="tab = 'repeat'">Repeating <span class="num">{{ activeSchedules.length }}</span></button>
    </div>

    <template v-if="tab === 'pay'">
      <section class="section" aria-labelledby="fortnight-label">
        <p class="group-label num">
          <span id="fortnight-label">Next two weeks</span>
          <span>{{ formatMoney(fortnightTotal) }}</span>
        </p>
        <div class="panel fortnight" role="group" aria-labelledby="fortnight-label">
          <span v-for="d in fortnight.slice(0, 7)" :key="`w${d.key}`" class="fortnight__wd" aria-hidden="true">{{ d.weekday }}</span>
          <button
            v-for="d in fortnight"
            :key="d.key"
            type="button"
            class="day"
            :class="{ 'day--due': d.total > 0, 'day--today': d.isToday }"
            :aria-pressed="selectedDate === d.key"
            :aria-label="`${d.title}${d.total ? `, LKR ${formatMoney(d.total)} due` : ', nothing due'}`"
            :disabled="!d.total"
            @click="selectedDate = selectedDate === d.key ? null : d.key"
          >
            <span class="day__date num">{{ d.date }}</span>
            <span class="day__amount num">{{ d.total ? compact(d.total) : '' }}</span>
          </button>
        </div>
      </section>

      <div v-if="selectedDate" class="chips bills-chips">
        <button class="chip on" @click="selectedDate = null">
          {{ format(parseISO(selectedDate), 'EEE d MMM') }} <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <section v-for="g in groups" :key="g.title" class="section">
        <p class="group-label num"><span>{{ g.title }}</span><span>{{ formatMoney(g.total) }}</span></p>
        <div class="list">
          <ExpenseRow
            v-for="e in g.items"
            :key="e.id"
            :expense="e"
            status-icon
            @mark-paid="markPaid"
            @delete="deleteExpense"
            @edit="edit"
          />
        </div>
      </section>
      <p v-if="!groups.length" class="empty bills-empty">All paid. New bills show up here as their due dates come closer.</p>

      <section v-if="collect.length" class="section">
        <p class="group-label num"><span>To collect</span><span>{{ formatMoney(collectTotal) }}</span></p>
        <nav class="list">
          <router-link v-for="c in collect" :key="c.id" to="/lend-tracker" class="row">
            <span class="row__icon material-symbols-outlined">group</span>
            <span class="row__main">
              <span class="row__title">{{ c.lentTo || c.name }}</span>
              <span class="row__meta num">Ask on {{ format(parseISO(c.collectionDate), 'd MMM') }}</span>
            </span>
            <span class="row__end row__amount num">{{ formatMoney(c.amount) }}</span>
          </router-link>
        </nav>
      </section>
    </template>

    <template v-else-if="tab === 'paid'">
      <section class="section">
        <p class="group-label num"><span>Paid this cycle</span><span>{{ formatMoney(paidTotal) }}</span></p>
        <div v-if="paidBills.length" class="list">
          <ExpenseRow
            v-for="e in paidBills"
            :key="e.id"
            :expense="e"
            status-icon
            show-paid
            @delete="deleteExpense"
            @edit="edit"
          />
        </div>
        <p v-else class="empty">No bills paid yet this cycle.</p>
      </section>
    </template>

    <template v-else>
      <section class="section">
        <p class="group-label num"><span>Every month</span><span>{{ formatMoney(monthlyTotal) }}</span></p>
        <div v-if="activeSchedules.length" class="list">
          <button v-for="s in activeSchedules" :key="s.id" class="row" @click="openSchedule(s)">
            <span class="row__icon material-symbols-outlined" :class="states[s.id]?.iconCls">{{ states[s.id]?.icon || iconFor(s) }}</span>
            <span class="row__main">
              <span class="row__title">{{ s.name }}</span>
              <span class="row__meta num">{{ categoryLabel(s.category) }} · on the {{ ordinal(s.dayOfMonth) }}</span>
            </span>
            <span class="row__end row__end--stack">
              <span class="row__amount num">{{ formatMoney(s.amount) }}</span>
              <span v-if="states[s.id]" class="pill" :class="states[s.id].cls">{{ states[s.id].text }}</span>
            </span>
          </button>
        </div>
        <p v-else class="empty">Nothing repeats yet. Add an expense in Bills or Subscriptions and it repeats every month.</p>
      </section>

      <section v-if="stoppedSchedules.length" class="section">
        <p class="group-label"><span>Stopped</span></p>
        <div class="list">
          <button v-for="s in stoppedSchedules" :key="s.id" class="row" @click="confirmDelete(s)">
            <span class="row__icon material-symbols-outlined">{{ iconFor(s) }}</span>
            <span class="row__main">
              <span class="row__title">{{ s.name }}</span>
              <span class="row__meta">{{ categoryLabel(s.category) }}</span>
            </span>
            <span class="row__end row__amount num is-zero">{{ formatMoney(s.amount) }}</span>
          </button>
        </div>
      </section>
    </template>

    <EditExpenseSheet v-model="showEdit" :expense="editing" />
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { format, parseISO, addDays, startOfDay, differenceInCalendarDays } from 'date-fns'
import { useFinanceStore } from '../stores/financeStore'
import { useReminders } from '../composables/useReminders'
import { useExpenseActions } from '../composables/useExpenseActions'
import { useCloudSync } from '../composables/useCloudSync'
import { formatMoney, getBudgetMonth } from '../utils/format'
import { compact } from '../utils/chartScale'
import { getCategoryIcon, categoryLabel } from '../utils/categoryConfig'
import { showToast } from '../utils/toast'
import ExpenseRow from '../components/expenses/ExpenseRow.vue'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'

const $q = useQuasar()
const finance = useFinanceStore()
const { overdue, dueTomorrow, upcoming } = useReminders()
const { markPaid, deleteExpense } = useExpenseActions()
const { syncNow } = useCloudSync()

const tab = ref('pay')
const showEdit = ref(false)
const editing = ref(null)
function edit(e) {
  editing.value = e
  showEdit.value = true
}

const HORIZON_DAYS = 45

const unpaid = computed(() => {
  const today = startOfDay(new Date())
  const horizon = addDays(today, HORIZON_DAYS)
  return finance.expenses
    .filter(e => e.status !== 'paid' && !e.isAggregate && e.dueDate && e.category !== 'lend')
    .filter(e => parseISO(e.dueDate) <= horizon)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
})

const overdueItems = computed(() => unpaid.value.filter(e => parseISO(e.dueDate) < startOfDay(new Date())))
const unpaidTotal = computed(() => unpaid.value.reduce((s, e) => s + e.amount, 0))

const selectedDate = ref(null)

const fortnight = computed(() => {
  const today = startOfDay(new Date())
  return Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i)
    const key = format(day, 'yyyy-MM-dd')
    return {
      key,
      weekday: format(day, 'EEE'),
      date: format(day, 'd'),
      title: format(day, 'EEEE d MMM'),
      isToday: i === 0,
      total: unpaid.value.filter(e => e.dueDate === key).reduce((s, e) => s + e.amount, 0)
    }
  })
})
const fortnightTotal = computed(() => fortnight.value.reduce((s, d) => s + d.total, 0))

const groups = computed(() => {
  const today = startOfDay(new Date())
  const shown = selectedDate.value ? unpaid.value.filter(e => e.dueDate === selectedDate.value) : unpaid.value
  const buckets = [
    { title: 'Overdue', test: d => d < 0 },
    { title: 'Today and tomorrow', test: d => d >= 0 && d <= 1 },
    { title: 'Next 7 days', test: d => d > 1 && d <= 7 },
    { title: 'Later', test: d => d > 7 }
  ]
  return buckets
    .map(b => {
      const items = shown.filter(e => b.test(differenceInCalendarDays(parseISO(e.dueDate), today)))
      return { title: b.title, items, total: items.reduce((s, e) => s + e.amount, 0) }
    })
    .filter(g => g.items.length)
})

const isBill = e => !e.refund && (e.isRecurring || e.isInstallment || e.scheduleId || e.isScheduled ||
  ['loans', 'creditCardPayment'].includes(e.category) || (e.category === 'bills' && !e.sourceSmsFingerprint))

const cycleExpenses = computed(() => {
  const month = getBudgetMonth()
  return finance.expenses.filter(e => e.monthYear === month && !e.isAggregate)
})

const paidTime = e => new Date(e.paidAt || e.at || e.dueDate || 0).getTime() || 0

const paidBills = computed(() => {
  const month = getBudgetMonth()
  const today = format(new Date(), 'yyyy-MM-dd')
  const horizon = format(addDays(new Date(), HORIZON_DAYS), 'yyyy-MM-dd')
  return finance.expenses
    .filter(e => e.status === 'paid' && !e.isAggregate && isBill(e) &&
      (e.monthYear === month || (e.dueDate && e.dueDate > today && e.dueDate <= horizon)))
    .sort((a, b) => paidTime(b) - paidTime(a))
})
const paidTotal = computed(() => paidBills.value.reduce((s, e) => s + (e.amount || 0), 0))

const thisCycle = computed(() => {
  const map = new Map()
  for (const e of cycleExpenses.value) if (e.scheduleId) map.set(e.scheduleId, e)
  return map
})

function cycleState(s) {
  const e = thisCycle.value.get(s.id)
  if (!e) return null
  if (e.status === 'paid') {
    const t = e.paidAt || e.at || e.dueDate
    const on = t ? new Date(t) : null
    return { text: on && !isNaN(on) ? `Paid ${format(on, 'd MMM')}` : 'Paid', cls: 'pill--positive', icon: 'check_circle', iconCls: 'is-paid' }
  }
  const days = e.dueDate ? differenceInCalendarDays(parseISO(e.dueDate), startOfDay(new Date())) : null
  const icon = 'radio_button_unchecked'
  if (days !== null && days < 0) return { text: `${-days}d overdue`, cls: 'pill--negative', icon, iconCls: 'is-overdue' }
  if (days === 0) return { text: 'Due today', cls: 'pill--warning', icon }
  if (days === 1) return { text: 'Due tomorrow', cls: 'pill--warning', icon }
  return { text: e.dueDate ? `Due ${format(parseISO(e.dueDate), 'd MMM')}` : 'Not paid', cls: '', icon }
}

const states = computed(() => Object.fromEntries(activeSchedules.value.map(s => [s.id, cycleState(s)])))

const collect = computed(() =>
  [...overdue.value, ...dueTomorrow.value, ...upcoming.value]
    .filter(e => e.isLendReminder)
    .sort((a, b) => (a.collectionDate || '').localeCompare(b.collectionDate || ''))
)
const collectTotal = computed(() => collect.value.reduce((s, e) => s + e.amount, 0))

const activeSchedules = computed(() =>
  finance.recurringSchedules.filter(s => s.active).sort((a, b) => (a.dayOfMonth || 0) - (b.dayOfMonth || 0))
)
const stoppedSchedules = computed(() => finance.recurringSchedules.filter(s => !s.active))
const monthlyTotal = computed(() => activeSchedules.value.reduce((s, x) => s + (x.amount || 0), 0))

const ordinal = n => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`

function iconFor(s) {
  const cat = getCategoryIcon(s.category)
  return cat.icon !== 'category' ? cat.icon : (s.icon || cat.icon)
}

function openSchedule(s) {
  const latest = thisCycle.value.get(s.id) ||
    finance.expenses.filter(e => e.scheduleId === s.id).sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))[0]
  if (latest) edit(latest)
  else confirmStop(s)
}

function confirmStop(s) {
  $q.dialog({
    title: `Stop ${s.name}?`,
    message: 'It stops repeating and its unpaid future entries are removed. Paid ones stay.',
    cancel: { label: 'Keep', flat: true, color: 'dark' },
    ok: { label: 'Stop', unelevated: true, color: 'negative' }
  }).onOk(() => {
    finance.stopSchedule(s.id)
    syncNow()
    showToast(`${s.name} stopped`)
  })
}

function confirmDelete(s) {
  $q.dialog({
    title: `Delete ${s.name}?`,
    message: 'This removes the stopped schedule. Expenses it already created stay.',
    cancel: { label: 'Keep', flat: true, color: 'dark' },
    ok: { label: 'Delete', unelevated: true, color: 'negative' }
  }).onOk(() => {
    finance.recurringSchedules = finance.recurringSchedules.filter(x => x.id !== s.id)
    syncNow()
    showToast(`${s.name} deleted`, 'delete')
  })
}
</script>

<style lang="scss" scoped>
.bills-seg { margin-bottom: 4px; }
.bills-seg .num { color: var(--muted); margin-left: 4px; }
.bills-empty { margin-top: 16px; }
.section { margin-top: 12px; }
.bills-chips { margin-top: 12px; }
.row__icon.is-paid { color: var(--positive); }
.row__icon.is-overdue { color: var(--negative); }

.fortnight {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  padding: 8px;
}

.fortnight__wd {
  text-align: center;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  padding: 2px 0;
}

.day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 52px;
  padding: 7px 0 9px;
  border: 0;
  border-radius: var(--radius-control);
  background: none;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.1s ease;

  &:disabled { cursor: default; }
  &:not(:disabled):active { transform: scale(0.96); }

  &__date { font-size: 16px; line-height: 20px; font-weight: 500; }
  &__amount { font-size: 13px; line-height: 16px; font-weight: 600; color: var(--text); min-height: 16px; }

  &--due { background: var(--raised); color: var(--text); }
  &--today .day__date { color: var(--text); }
  &--today::after {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 3px;
    width: 16px;
    height: 2px;
    margin-left: -8px;
    border-radius: 1px;
    background: var(--hue);
  }

  &[aria-pressed='true'] {
    background: var(--primary);
    color: var(--on-primary);
    .day__date, .day__amount { color: var(--on-primary); }
  }
}
</style>
