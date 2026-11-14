import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { capacitorStorage } from '../utils/capacitorStorage'
import { validateGoal } from '../utils/validators'

export const useSavingsStore = defineStore('savings', () => {
  const goals = ref([])
  const initialized = ref(false)

  function addGoal(goal) {
    try {
      const validation = validateGoal(goal)
      if (!validation.valid) return { success: false, errors: validation.errors }
      goals.value.push({ ...goal, id: uuidv4(), createdAt: Date.now(), updatedAt: Date.now() })
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] addGoal failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function addFunds(id, amount) {
    try {
      if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) return { success: false }
      const g = goals.value.find(g => g.id === id)
      if (!g) return { success: false, errors: ['Goal not found'] }
      g.savedAmount = (g.savedAmount || 0) + amount
      g.deposits = g.deposits || []
      const depositId = uuidv4()
      g.deposits.push({ id: depositId, date: new Date().toISOString(), amount })
      g.updatedAt = Date.now()
      return { success: true, depositId }
    } catch (err) {
      console.error('[FLOWW] addFunds failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function removeFunds(id, amount, depositId = null) {
    try {
      const g = goals.value.find(g => g.id === id)
      if (!g) return { success: false }
      g.savedAmount = Math.max(0, (g.savedAmount || 0) - amount)
      if (g.deposits?.length) {
        let idx = -1
        if (depositId) {
          idx = g.deposits.findIndex(d => d.id === depositId)
        }
        if (idx === -1) {
          // Fallback: find last deposit matching amount
          for (let i = g.deposits.length - 1; i >= 0; i--) {
            if (g.deposits[i].amount === amount) { idx = i; break }
          }
        }
        if (idx !== -1) g.deposits.splice(idx, 1)
      }
      g.updatedAt = Date.now()
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function updateGoal(id, data) {
    try {
      const g = goals.value.find(g => g.id === id)
      if (!g) return { success: false }
      if (data.name !== undefined) g.name = data.name
      if (data.targetAmount !== undefined) g.targetAmount = data.targetAmount
      if (data.color !== undefined) g.color = data.color
      if (data.colorName !== undefined) g.colorName = data.colorName
      if (data.targetDate !== undefined) g.targetDate = data.targetDate
      if (data.emoji !== undefined) g.emoji = data.emoji
      // Manual savedAmount edit: reconcile by writing an adjustment deposit so the
      // deposit sum stays the source of truth (the integrity check recomputes
      // savedAmount from deposits, so a bare assignment would be reverted).
      if (data.savedAmount !== undefined && typeof data.savedAmount === 'number' && !isNaN(data.savedAmount)) {
        const depositSum = (g.deposits || []).reduce((s, d) => s + (Number(d.amount) || 0), 0)
        const diff = Math.round((data.savedAmount - depositSum) * 100) / 100
        if (diff !== 0) {
          g.deposits = g.deposits || []
          g.deposits.push({ id: uuidv4(), date: new Date().toISOString(), amount: diff, adjustment: true })
        }
        g.savedAmount = data.savedAmount
      }
      g.updatedAt = Date.now()
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function updateDeposit(goalId, depositId, updates) {
    try {
      const g = goals.value.find(g => g.id === goalId)
      if (!g || !g.deposits) return { success: false }
      const d = g.deposits.find(d => d.id === depositId)
      if (!d) return { success: false }
      const oldAmount = typeof d.amount === 'number' ? d.amount : 0
      if (updates.amount !== undefined) {
        if (typeof updates.amount !== 'number' || updates.amount <= 0 || isNaN(updates.amount)) {
          return { success: false, errors: ['Invalid amount'] }
        }
        d.amount = updates.amount
      }
      if (updates.date !== undefined) d.date = updates.date
      // Recalculate savedAmount
      const newAmount = typeof d.amount === 'number' ? d.amount : 0
      g.savedAmount = Math.max(0, (g.savedAmount || 0) - oldAmount + newAmount)
      g.updatedAt = Date.now()
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function deleteDeposit(goalId, depositId) {
    try {
      const g = goals.value.find(g => g.id === goalId)
      if (!g || !g.deposits) return { success: false }
      const d = g.deposits.find(d => d.id === depositId)
      if (!d) return { success: false }
      g.savedAmount = Math.max(0, (g.savedAmount || 0) - (d.amount || 0))
      g.deposits = g.deposits.filter(d => d.id !== depositId)
      g.updatedAt = Date.now()
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function removeGoal(id) {
    try {
      const before = goals.value.length
      goals.value = goals.value.filter(g => g.id !== id)
      return { success: goals.value.length < before }
    } catch (err) {
      console.error('[FLOWW] removeGoal failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  const totalSaved = computed(() =>
    (goals.value || []).reduce((s, g) => s + (g.savedAmount || 0), 0)
  )

  function seedData() {
    if (initialized.value) return
    initialized.value = true
  }

  return { goals, totalSaved, addGoal, addFunds, removeFunds, updateGoal, updateDeposit, deleteDeposit, removeGoal, seedData, initialized }
}, { persist: { storage: capacitorStorage } })
