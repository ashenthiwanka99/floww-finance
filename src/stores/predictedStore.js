import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { capacitorStorage } from '../utils/capacitorStorage'
import { useFinanceStore } from './financeStore'
import { getBudgetMonth } from '../utils/format'

export const usePredictedStore = defineStore('predicted', () => {
  const items = ref([])

  const financeStore = useFinanceStore()

  // Current month predictions (planned only)
  const currentMonthPredictions = computed(() =>
    items.value.filter(p => p.monthYear === financeStore.currentMonth && p.status === 'planned')
  )

  // Total predicted for current month
  const totalPredicted = computed(() =>
    currentMonthPredictions.value.reduce((s, p) => s + (p.amount || 0), 0)
  )

  // Projected remaining if all predictions happen
  const projectedRemaining = computed(() =>
    financeStore.remaining - totalPredicted.value
  )

  // Projected utilization %
  const projectedUtilization = computed(() =>
    financeStore.totalIncome > 0
      ? Math.min(100, Math.round(((financeStore.totalSpent + totalPredicted.value) / financeStore.totalIncome) * 100))
      : 0
  )

  function addPrediction(data) {
    if (!data.name?.trim() || !data.amount || data.amount <= 0) {
      return { success: false, errors: ['Name and amount are required'] }
    }
    items.value.push({
      ...data,
      id: uuidv4(),
      status: 'planned',
      monthYear: data.monthYear || getBudgetMonth(),
      confidence: data.confidence || 'likely',
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
    return { success: true }
  }

  function updatePrediction(id, updates) {
    const item = items.value.find(p => p.id === id)
    if (!item) return
    Object.assign(item, updates, { updatedAt: Date.now() })
  }

  function deletePrediction(id) {
    items.value = items.value.filter(p => p.id !== id)
  }

  function convertToActual(id) {
    const pred = items.value.find(p => p.id === id)
    if (!pred || pred.status !== 'planned') return

    const result = financeStore.addExpense({
      name: pred.name,
      amount: pred.amount,
      category: pred.category || 'others',
      dueDate: format(new Date(), 'yyyy-MM-dd'),
      monthYear: pred.monthYear || financeStore.currentMonth,
      status: 'pending',
      icon: pred.icon || 'category',
      iconColor: pred.iconColor || '#B9CAC2',
      notes: pred.notes || ''
    })

    if (result?.success !== false) {
      pred.status = 'converted'
      pred.updatedAt = Date.now()
    }
  }

  function cancelPrediction(id) {
    const item = items.value.find(p => p.id === id)
    if (item) {
      item.status = 'cancelled'
      item.updatedAt = Date.now()
    }
  }

  return {
    items,
    currentMonthPredictions,
    totalPredicted,
    projectedRemaining,
    projectedUtilization,
    addPrediction,
    updatePrediction,
    deletePrediction,
    convertToActual,
    cancelPrediction
  }
}, { persist: { storage: capacitorStorage } })
