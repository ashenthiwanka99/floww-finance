import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { capacitorStorage } from '../utils/capacitorStorage'
import { validateBuyItem } from '../utils/validators'

export const useBuyListStore = defineStore('buyList', () => {
  const items = ref([])
  const initialized = ref(false)

  const thisMonth = computed(() => items.value.filter(i => i.month === 'thisMonth'))
  const nextMonth = computed(() => items.value.filter(i => i.month === 'nextMonth'))
  const someday = computed(() => items.value.filter(i => i.month === 'someday'))

  const totalEstimated = computed(() =>
    items.value
      .filter(i => !i.bought)
      .reduce((s, i) => s + (i.estimatedCost || 0), 0)
  )

  const boughtItems = computed(() => items.value.filter(i => i.bought))
  const boughtCount = computed(() => boughtItems.value.length)

  function addItem(item) {
    try {
      const validation = validateBuyItem(item)
      if (!validation.valid) return { success: false, errors: validation.errors }
      items.value.push({ ...item, id: uuidv4(), bought: false, boughtDate: null, createdAt: Date.now(), updatedAt: Date.now() })
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] addItem failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function toggleBought(id, actualCost = null) {
    try {
      const i = items.value.find(i => i.id === id)
      if (i) {
        i.bought = !i.bought
        i.boughtDate = i.bought ? new Date().toISOString() : null
        if (i.bought && actualCost != null) {
          i.actualCost = actualCost
        } else if (!i.bought) {
          i.actualCost = null
        }
        i.updatedAt = Date.now()
      }
    } catch (err) {
      console.error('[FLOWW] toggleBought failed:', err?.message || 'Unknown error')
    }
  }

  function updateItem(id, updates) {
    try {
      const i = items.value.find(i => i.id === id)
      if (!i) return
      // Validate fields before assigning
      const validMonths = ['thisMonth', 'nextMonth', 'someday']
      const safeUpdates = { ...updates }
      if (safeUpdates.estimatedCost !== undefined && (typeof safeUpdates.estimatedCost !== 'number' || safeUpdates.estimatedCost < 0 || isNaN(safeUpdates.estimatedCost))) {
        delete safeUpdates.estimatedCost
      }
      if (safeUpdates.actualCost !== undefined && safeUpdates.actualCost !== null && (typeof safeUpdates.actualCost !== 'number' || safeUpdates.actualCost < 0 || isNaN(safeUpdates.actualCost))) {
        delete safeUpdates.actualCost
      }
      if (safeUpdates.month !== undefined && !validMonths.includes(safeUpdates.month)) {
        delete safeUpdates.month
      }
      Object.assign(i, safeUpdates, { updatedAt: Date.now() })
    } catch (err) {
      console.error('[FLOWW] updateItem failed:', err?.message || 'Unknown error')
    }
  }

  function deleteItem(id) {
    try {
      items.value = items.value.filter(i => i.id !== id)
    } catch (err) {
      console.error('[FLOWW] deleteItem failed:', err?.message || 'Unknown error')
    }
  }

  function moveItem(id, month) {
    try {
      const i = items.value.find(i => i.id === id)
      if (i) {
        i.month = month
        i.updatedAt = Date.now()
      }
    } catch (err) {
      console.error('[FLOWW] moveItem failed:', err?.message || 'Unknown error')
    }
  }

  function deleteByListId(listId) {
    if (!listId || typeof listId !== 'string') return
    items.value = items.value.filter(i => i.groceryListId !== listId)
  }

  function updateListTitle(listId, newTitle) {
    items.value.forEach(i => {
      if (i.groceryListId === listId) {
        i.groceryListTitle = newTitle
      }
    })
  }

  function seedData() {
    if (initialized.value) return
    initialized.value = true
  }

  return {
    items,
    thisMonth,
    nextMonth,
    someday,
    totalEstimated,
    boughtItems,
    boughtCount,
    addItem,
    toggleBought,
    updateItem,
    deleteItem,
    deleteByListId,
    updateListTitle,
    moveItem,
    seedData,
    initialized
  }
}, { persist: { storage: capacitorStorage } })
