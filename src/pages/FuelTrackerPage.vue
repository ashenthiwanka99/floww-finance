<template>
  <q-page>
    <PageHead title="Fuel" back />

    <MonthNavigator
      :month-year="financeStore.currentMonth"
      @prev="financeStore.navigateMonth(-1)"
      @next="financeStore.navigateMonth(1)"
      @jump="financeStore.currentMonth = $event"
    />

    <section class="kpis" aria-label="This month">
      <div>
        <p class="figure-label">Cost</p>
        <p class="figure num" :class="{ 'is-zero': !totalCost }">{{ formatMoney(totalCost) }}</p>
      </div>
      <div>
        <p class="figure-label">Litres</p>
        <p class="figure num" :class="{ 'is-zero': !totalLiters }">{{ totalLiters.toFixed(1) }}</p>
        <p v-if="avgPricePerLiter" class="fuel-sub num">{{ formatMoney(avgPricePerLiter) }} a litre</p>
      </div>
      <div>
        <p class="figure-label">Km per litre</p>
        <p v-if="latestKmPerLiter" class="figure num">{{ latestKmPerLiter.toFixed(1) }}</p>
        <p v-else class="figure is-zero" aria-label="Not enough odometer readings">-</p>
        <p class="fuel-sub">{{ latestKmPerLiter ? 'Latest fill-up' : 'Needs two readings' }}</p>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Fill-ups</h2>
        <span class="num fuel-count">{{ fillUpCount }}</span>
      </div>
      <div v-if="sortedFuelExpenses.length" class="list">
        <div v-for="exp in sortedFuelExpenses" :key="exp.id" class="row fuel-row" role="button" tabindex="0" @click="edit(exp)" @keydown.enter="edit(exp)">
          <span class="row__icon material-symbols-outlined">local_gas_station</span>
          <span class="row__main">
            <span class="row__title">{{ formatDate(exp.dueDate) }}</span>
            <span class="row__meta num">
              {{ exp.fuelLiters }} L at {{ formatMoney(exp.fuelPricePerLiter) }}<template v-if="exp.fuelOdometer"> · {{ formatMoney(exp.fuelOdometer) }} km</template>
            </span>
          </span>
          <span class="row__end row__amount num">{{ formatMoney(exp.amount) }}</span>
        </div>
      </div>
      <p v-else-if="fuelExpenses.length" class="empty">No fill-ups in this cycle.</p>
      <p v-else class="empty">No fill-ups yet. Add an expense in the Fuel category with its litres and odometer to track cost and mileage.</p>
    </section>
    <EditExpenseSheet v-model="showEdit" :expense="editing" />
  </q-page>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import MonthNavigator from '../components/shared/MonthNavigator.vue'
import { formatMoney } from '../utils/format'
import { format, parseISO } from 'date-fns'
import PageHead from '../components/layout/PageHead.vue'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'

const showEdit = ref(false)
const editing = ref(null)
function edit(e) {
  editing.value = e
  showEdit.value = true
}

const financeStore = useFinanceStore()

// All fuel expenses
const fuelExpenses = computed(() =>
  financeStore.expenses.filter(e => e.category === 'fuel' && e.fuelLiters)
)

// Current month fuel
const currentMonthFuel = computed(() =>
  fuelExpenses.value.filter(e => e.monthYear === financeStore.currentMonth)
)

const totalCost = computed(() =>
  currentMonthFuel.value.reduce((s, e) => s + (e.amount || 0), 0)
)

const totalLiters = computed(() =>
  currentMonthFuel.value.reduce((s, e) => s + (e.fuelLiters || 0), 0)
)

const fillUpCount = computed(() => currentMonthFuel.value.length)

const avgPricePerLiter = computed(() => {
  if (totalLiters.value <= 0) return 0
  return Math.round(totalCost.value / totalLiters.value)
})

// Latest efficiency: km driven since the previous fill-up, over the litres
// added at the latest one. Needs two fill-ups with odometer readings.
const latestKmPerLiter = computed(() => {
  const withOdo = fuelExpenses.value
    .filter(e => e.fuelOdometer)
    .sort((a, b) => (a.fuelOdometer || 0) - (b.fuelOdometer || 0))
  if (withOdo.length < 2) return 0
  const last = withOdo[withOdo.length - 1]
  const km = last.fuelOdometer - withOdo[withOdo.length - 2].fuelOdometer
  return last.fuelLiters > 0 && km > 0 ? km / last.fuelLiters : 0
})

const sortedFuelExpenses = computed(() =>
  [...currentMonthFuel.value].sort((a, b) =>
    new Date(b.dueDate || 0) - new Date(a.dueDate || 0)
  )
)

function formatDate(d) {
  try { return format(parseISO(d), 'EEE, d MMM') } catch { return d }
}
</script>

<style lang="scss" scoped>
.fuel-sub { font-size: var(--fs-small); line-height: 16px; color: var(--muted); }
.fuel-count { color: var(--muted); }

.fuel-row {
  cursor: default;
  &:active { background: none; }
}
</style>
