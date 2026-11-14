<template>
  <q-page>
    <PageHead title="Payment history" back />

    <div class="kpis">
      <div>
        <p class="figure-label">Paid in {{ currentYear }}</p>
        <p class="figure num" :class="{ 'is-zero': !totalPaidThisYear }">{{ formatMoney(totalPaidThisYear) }}</p>
      </div>
      <div>
        <p class="figure-label">Monthly average</p>
        <p class="figure num" :class="{ 'is-zero': !monthlyAvg }">{{ formatMoney(monthlyAvg) }}</p>
      </div>
    </div>

    <label class="search">
      <span class="material-symbols-outlined">search</span>
      <input v-model="query" type="search" class="input" placeholder="Search payments" aria-label="Search payments" />
      <button v-if="query" class="field-clear" aria-label="Clear search" @click="query = ''">
        <span class="material-symbols-outlined">close</span>
      </button>
    </label>

    <div class="seg seg--block history-range" role="group" aria-label="Range">
      <button v-for="r in ranges" :key="r.value" :aria-pressed="dateRange === r.value" @click="dateRange = r.value">{{ r.label }}</button>
    </div>

    <section v-for="g in groups" :key="g.key">
      <p class="group-label num"><span>{{ g.label }}</span><span>{{ formatMoney(g.total) }}</span></p>
      <div class="list">
        <ExpenseRow v-for="e in g.items" :key="e.id" :expense="e" :can-delete="false" @edit="edit" />
      </div>
    </section>
    <p v-if="!groups.length" class="empty history-empty">
      {{ query ? 'No payments match that search.' : 'No payments recorded in this range.' }}
    </p>

    <EditExpenseSheet v-model="showEdit" :expense="editing" />
  </q-page>
</template>

<script setup>
import { computed, ref } from 'vue'
import { format, parse, parseISO, subDays, subMonths } from 'date-fns'
import { useFinanceStore } from '../stores/financeStore'
import { formatMoney, getCycleWindow } from '../utils/format'
import PageHead from '../components/layout/PageHead.vue'
import ExpenseRow from '../components/expenses/ExpenseRow.vue'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'

const financeStore = useFinanceStore()

const currentYear = String(new Date().getFullYear())

const showEdit = ref(false)
const editing = ref(null)
function edit(e) {
  editing.value = e
  showEdit.value = true
}

const paidThisYear = computed(() =>
  financeStore.expenses.filter(e => e.status === 'paid' && e.monthYear && e.monthYear.startsWith(currentYear))
)

const totalPaidThisYear = computed(() => paidThisYear.value.reduce((sum, e) => sum + (e.amount || 0), 0))

const monthlyAvg = computed(() => {
  const months = new Set(paidThisYear.value.map(e => e.monthYear))
  return Math.round(totalPaidThisYear.value / (months.size || 1))
})

const query = ref('')
const dateRange = ref('3m')
const ranges = [
  { label: '30 days', value: '30d' },
  { label: '3 months', value: '3m' },
  { label: 'This year', value: 'year' },
  { label: 'All', value: 'all' }
]

const paid = computed(() => {
  let list = financeStore.expenses.filter(e => e.status === 'paid' && !e.isAggregate)
  if (dateRange.value === 'year') {
    list = list.filter(e => e.monthYear?.startsWith(currentYear))
  } else if (dateRange.value !== 'all') {
    const cutoff = dateRange.value === '30d' ? subDays(new Date(), 30) : subMonths(new Date(), 3)
    list = list.filter(e => e.dueDate && parseISO(e.dueDate) >= cutoff)
  }
  const q = query.value.trim().toLowerCase()
  if (q) list = list.filter(e => e.name?.toLowerCase().includes(q))
  return list.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))
})

function cycleLabel(key) {
  const w = getCycleWindow(key)
  if (!w?.start) return format(parse(key, 'yyyy-MM', new Date()), 'MMMM yyyy')
  const from = format(parseISO(w.start), 'd MMM')
  return w.end ? from + ' to ' + format(parseISO(w.end), 'd MMM yyyy') : 'From ' + from
}

const groups = computed(() => {
  const map = new Map()
  for (const e of paid.value) {
    const key = e.monthYear || 'none'
    if (!map.has(key)) {
      const label = key === 'none' ? 'No cycle' : cycleLabel(key)
      map.set(key, { key, label, total: 0, items: [] })
    }
    const g = map.get(key)
    g.items.push(e)
    g.total += e.amount || 0
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key))
})
</script>

<style lang="scss" scoped>
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

.history-range { margin-top: 12px; }
.history-empty { margin-top: 16px; }
</style>
