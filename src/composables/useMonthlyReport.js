import { computed } from 'vue'
import { format, parse } from 'date-fns'
import { useFinanceStore } from '../stores/financeStore'

// Spending by category uses the Home's rule (paid, not a transfer), so the
// report and Home always show the same totals for the same cycle.
export function useMonthlyReport() {
  const store = useFinanceStore()

  const monthLabel = computed(() => format(parse(store.currentMonth, 'yyyy-MM', new Date()), 'MMMM yyyy'))

  const prevKey = computed(() => {
    const [y, m] = store.currentMonth.split('-').map(Number)
    return format(new Date(y, m - 2), 'yyyy-MM')
  })

  function isSpending(e, monthKey) {
    return e.monthYear === monthKey && e.status === 'paid' && !store.excludedFromSpending.includes(e.category)
  }

  function totalsByCategory(monthKey) {
    const totals = {}
    for (const e of store.expenses) {
      if (isSpending(e, monthKey)) totals[e.category] = (totals[e.category] || 0) + e.amount
    }
    return totals
  }

  const categories = computed(() => {
    const rows = Object.entries(totalsByCategory(store.currentMonth))
      .map(([key, amount]) => ({ key, amount, limit: Number(store.budgetLimits?.[key]) || 0 }))
      .sort((a, b) => b.amount - a.amount)
    const max = rows[0]?.amount || 1
    return rows.map(r => ({ ...r, pct: (r.amount / max) * 100, over: r.limit > 0 && r.amount > r.limit }))
  })

  const spentTotal = computed(() => categories.value.reduce((s, c) => s + c.amount, 0))

  const comparison = computed(() => {
    const current = totalsByCategory(store.currentMonth)
    const previous = totalsByCategory(prevKey.value)
    return [...new Set([...Object.keys(current), ...Object.keys(previous)])]
      .map(key => {
        const now = current[key] || 0
        const before = previous[key] || 0
        return { key, now, before, change: now - before, isNew: before === 0 && now > 0 }
      })
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  })

  const prevTotal = computed(() => comparison.value.reduce((s, c) => s + c.before, 0))

  const biggestExpense = computed(() =>
    store.currentMonthExpenses
      .filter(e => isSpending(e, store.currentMonth))
      .reduce((max, e) => (e.amount > (max?.amount || 0) ? e : max), null)
  )

  return { monthLabel, categories, spentTotal, comparison, prevTotal, biggestExpense }
}
