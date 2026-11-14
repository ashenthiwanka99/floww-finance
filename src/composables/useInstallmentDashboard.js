import { computed } from 'vue'
import { format, parseISO } from 'date-fns'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'

export function useInstallmentDashboard() {
  const financeStore = useFinanceStore()
  const settingsStore = useSettingsStore()

  // Custom categories marked as installment type (e.g., Koko, Mint)
  const installmentCategoryNames = computed(() => {
    const names = new Set(['installments'])
    for (const cat of (settingsStore.customCategories || [])) {
      if (cat.type === 'installment') names.add(cat.name)
    }
    return names
  })

  // ── All BNPL installment expenses (exclude loan EMIs) ──
  const allInstallmentExpenses = computed(() =>
    financeStore.expenses.filter(e =>
      e.installmentGroupId &&
      !e.loanId &&
      e.category !== 'loans' &&
      (installmentCategoryNames.value.has(e.category) || e.isInstallment)
    )
  )

  // ── Group by installmentGroupId → individual BNPL plans ──
  const plans = computed(() => {
    const groups = new Map()
    for (const e of allInstallmentExpenses.value) {
      const key = e.installmentGroupId
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(e)
    }

    return Array.from(groups.entries()).map(([groupId, expenses]) => {
      // Sort by installmentCurrent to get ordered list
      expenses.sort((a, b) => (a.installmentCurrent || 0) - (b.installmentCurrent || 0))

      const first = expenses[0]
      const planName = first.name || 'Installment'
      const monthlyAmount = first.amount || 0
      const totalInstallments = first.installmentTotal || expenses.length
      const paidCount = expenses.filter(e => e.status === 'paid').length
      const pendingCount = expenses.filter(e => e.status === 'pending').length
      const overdueCount = expenses.filter(e => e.status === 'overdue').length
      const totalCost = monthlyAmount * totalInstallments
      const totalPaid = monthlyAmount * paidCount
      const remaining = Math.max(0, totalCost - totalPaid)
      const progressPct = totalInstallments > 0 ? Math.min(100, Math.round((paidCount / totalInstallments) * 100)) : 0
      const isComplete = paidCount >= totalInstallments

      // Next due date — earliest pending/overdue expense
      const pendingExpenses = expenses.filter(e => e.status !== 'paid').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      const nextDueDate = pendingExpenses.length > 0 ? pendingExpenses[0].dueDate : null
      const nextDueFormatted = nextDueDate ? formatDueDate(nextDueDate) : ''

      // Provider — use the expense category (e.g., "Koko", "Mint")
      const provider = first.category || 'Other'

      return {
        groupId,
        planName,
        provider,
        monthlyAmount,
        totalInstallments,
        paidCount,
        pendingCount,
        overdueCount,
        totalCost,
        totalPaid,
        remaining,
        progressPct,
        isComplete,
        nextDueDate,
        nextDueFormatted,
        icon: first.icon || 'calendar_month',
        expenses
      }
    })
  })

  // ── Active vs completed ──
  const activePlans = computed(() =>
    plans.value.filter(p => !p.isComplete).sort((a, b) => b.remaining - a.remaining)
  )

  const completedPlans = computed(() =>
    plans.value.filter(p => p.isComplete)
  )

  // ── Summary stats ──
  const totalOutstanding = computed(() =>
    activePlans.value.reduce((s, p) => s + p.remaining, 0)
  )

  const monthlyBurden = computed(() =>
    activePlans.value.reduce((s, p) => s + p.monthlyAmount, 0)
  )

  return {
    plans,
    activePlans,
    completedPlans,
    totalOutstanding,
    monthlyBurden
  }
}

// Helpers
function formatDueDate(dateStr) {
  try {
    return format(parseISO(dateStr), 'd MMM')
  } catch {
    return dateStr
  }
}
