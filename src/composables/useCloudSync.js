import { ref, watch } from 'vue'
import { db } from '../firebase'
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore'
import { useFinanceStore } from '../stores/financeStore'
import { useSavingsStore } from '../stores/savingsStore'
import { useBuyListStore } from '../stores/buyListStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAuth } from './useAuth'
import { usePredictedStore } from '../stores/predictedStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'

// Persist sync state across app restarts
const lastSynced = ref(Number(localStorage.getItem('floww_last_synced')) || null)
const isSyncing = ref(false)
const syncError = ref(null)
const autoSyncEnabled = ref(localStorage.getItem('floww_auto_sync') !== 'false')

let debounceTimer = null
let retryCount = 0
const MAX_RETRIES = 3
let unsubscribeSnapshot = null
let isApplying = false

// Strip undefined values — Firestore rejects them
function stripUndefined(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => stripUndefined(item))
  }
  if (obj !== null && typeof obj === 'object') {
    const clean = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = stripUndefined(value)
      }
    }
    return clean
  }
  return obj
}

export function useCloudSync() {
  const { currentUser } = useAuth()
  const financeStore = useFinanceStore()
  const savingsStore = useSavingsStore()
  const buyListStore = useBuyListStore()
  const settingsStore = useSettingsStore()

  const predictedStore = usePredictedStore()
  const creditCardStore = useCreditCardStore()
  const accountsStore = useAccountsStore()

  // Collect all data into one object
  function collectData() {
    return {
      finance: {
        income: financeStore.income,
        monthlyIncomes: financeStore.monthlyIncomes,
        currencyTransfers: financeStore.currencyTransfers || [],
        usdAccount: financeStore.usdAccount || {},
        expenses: financeStore.expenses,
        loans: financeStore.loans,
        loanDisbursements: financeStore.loanDisbursements,
        recurringSchedules: financeStore.recurringSchedules || [],
        budgetLimits: financeStore.budgetLimits,
        assets: financeStore.assets || [],
        currentMonth: financeStore.currentMonth,
        initialized: financeStore.initialized,
        lastRecurringGenMonth: financeStore.lastRecurringGenMonth
      },
      savings: {
        goals: savingsStore.goals,
        initialized: savingsStore.initialized
      },
      buyList: {
        items: buyListStore.items,
        initialized: buyListStore.initialized
      },
      settings: {
        userName: settingsStore.userName,
        fxRate: settingsStore.fxRate,
        onboardingComplete: settingsStore.onboardingComplete,
        tourCompleted: settingsStore.tourCompleted,
        incomeData: settingsStore.incomeData,
        biometricEnabled: settingsStore.biometricEnabled,
        budgetAlertsEnabled: settingsStore.budgetAlertsEnabled,
        alertThreshold: settingsStore.alertThreshold,
        authMethod: settingsStore.authMethod,
        customCategories: settingsStore.customCategories,
        savedLoanTypes: settingsStore.savedLoanTypes,
        savedLenders: settingsStore.savedLenders,
        savedExpenseNames: settingsStore.savedExpenseNames,
        savedSplitPeople: settingsStore.savedSplitPeople
      },
      predicted: {
        items: predictedStore.items
      },
      creditCards: {
        cards: creditCardStore.cards || []
      },
      accounts: {
        accounts: accountsStore.accounts || [],
        incomes: accountsStore.incomes || [],
        corrections: accountsStore.corrections || [],
        setupComplete: accountsStore.setupComplete
      },
      syncedAt: Date.now()
    }
  }

  // Apply downloaded data to stores
  // Strip prototype-pollution keys from cloud data before it touches stores.
  function sanitize(value, depth = 0) {
    if (depth > 50 || value === null || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(v => sanitize(v, depth + 1))
    const out = {}
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
      out[k] = sanitize(value[k], depth + 1)
    }
    return out
  }

  async function applyData(rawData) {
    if (!rawData) return
    const data = sanitize(rawData)

    const { mergeArraysById, mergeMonthlyIncomes, mergeBudgetLimits } = await import('../utils/dataMerge')

    if (data.finance) {
      // Merge arrays by ID — preserves items from both local and cloud
      financeStore.expenses = mergeArraysById(financeStore.expenses, data.finance.expenses)
      financeStore.loans = mergeArraysById(financeStore.loans, data.finance.loans)
      financeStore.loanDisbursements = mergeArraysById(financeStore.loanDisbursements, data.finance.loanDisbursements)

      if (data.finance.recurringSchedules) {
        financeStore.recurringSchedules = mergeArraysById(
          financeStore.recurringSchedules || [],
          data.finance.recurringSchedules
        )
      }

      // Merge monthly incomes by month key
      financeStore.monthlyIncomes = mergeMonthlyIncomes(financeStore.monthlyIncomes, data.finance.monthlyIncomes)

      // Merge budget limits (cloud wins per key)
      financeStore.budgetLimits = mergeBudgetLimits(financeStore.budgetLimits, data.finance.budgetLimits)
      if (data.finance.assets) financeStore.assets = mergeArraysById(financeStore.assets || [], data.finance.assets)
      if (data.finance.currencyTransfers) {
        financeStore.currencyTransfers = mergeArraysById(financeStore.currencyTransfers || [], data.finance.currencyTransfers)
      }
      if (data.finance.usdAccount) financeStore.usdAccount = data.finance.usdAccount

      // Non-mergeable scalars — cloud wins
      financeStore.income = data.finance.income || financeStore.income
      financeStore.currentMonth = data.finance.currentMonth || financeStore.currentMonth
      financeStore.initialized = data.finance.initialized ?? true
      financeStore.lastRecurringGenMonth = data.finance.lastRecurringGenMonth || financeStore.lastRecurringGenMonth
    }

    if (data.savings) {
      savingsStore.goals = mergeArraysById(savingsStore.goals, data.savings.goals)
      savingsStore.initialized = data.savings.initialized ?? true
    }

    if (data.buyList) {
      buyListStore.items = mergeArraysById(buyListStore.items, data.buyList.items)
      buyListStore.initialized = data.buyList.initialized ?? true
    }

    if (data.predicted) {
      predictedStore.items = mergeArraysById(predictedStore.items, data.predicted.items)
    }

    if (data.creditCards) {
      creditCardStore.cards = mergeArraysById(creditCardStore.cards || [], data.creditCards.cards || [])
    }

    if (data.accounts) {
      accountsStore.accounts = mergeArraysById(accountsStore.accounts || [], data.accounts.accounts || [])
      accountsStore.incomes = mergeArraysById(accountsStore.incomes || [], data.accounts.incomes || [])
      accountsStore.corrections = mergeArraysById(accountsStore.corrections || [], data.accounts.corrections || [])
      accountsStore.setupComplete = !!(accountsStore.setupComplete || data.accounts.setupComplete)
    }

    if (data.settings) {
      // Settings: cloud wins for scalars
      settingsStore.userName = data.settings.userName || settingsStore.userName
      settingsStore.onboardingComplete = data.settings.onboardingComplete ?? settingsStore.onboardingComplete
      settingsStore.incomeData = data.settings.incomeData || settingsStore.incomeData
      settingsStore.biometricEnabled = data.settings.biometricEnabled ?? settingsStore.biometricEnabled
      settingsStore.budgetAlertsEnabled = data.settings.budgetAlertsEnabled ?? settingsStore.budgetAlertsEnabled
      settingsStore.alertThreshold = data.settings.alertThreshold ?? settingsStore.alertThreshold
      settingsStore.tourCompleted = data.settings.tourCompleted ?? settingsStore.tourCompleted
      settingsStore.authMethod = data.settings.authMethod ?? settingsStore.authMethod

      // Merge arrays by ID for custom categories
      settingsStore.customCategories = mergeArraysById(settingsStore.customCategories, data.settings.customCategories)

      // Merge saved names/types/lenders — union (deduplicate)
      const mergeUnique = (local, cloud) => {
        const set = new Set()
        const result = []
        for (const item of [...(local || []), ...(cloud || [])]) {
          const key = typeof item === 'string' ? item : (item.name || JSON.stringify(item))
          if (!set.has(key)) { set.add(key); result.push(item) }
        }
        return result
      }
      settingsStore.savedLoanTypes = mergeUnique(settingsStore.savedLoanTypes, data.settings.savedLoanTypes)
      settingsStore.savedLenders = mergeUnique(settingsStore.savedLenders, data.settings.savedLenders)
      settingsStore.savedExpenseNames = mergeUnique(settingsStore.savedExpenseNames, data.settings.savedExpenseNames)
      settingsStore.savedSplitPeople = mergeUnique(settingsStore.savedSplitPeople, data.settings.savedSplitPeople)

      if (data.settings.fxRate) settingsStore.fxRate = data.settings.fxRate
    }

    // Run data integrity check after applying cloud data
    try {
      const { checkDataIntegrity } = await import('../utils/dataIntegrity')
      const { useSettingsStore } = await import('../stores/settingsStore')
      const { useSavingsStore } = await import('../stores/savingsStore')
      const { useBuyListStore } = await import('../stores/buyListStore')
      checkDataIntegrity(financeStore, useSavingsStore(), useBuyListStore(), useSettingsStore(), creditCardStore, accountsStore)
    } catch {}
  }

  // Clear sync error
  function clearError() {
    syncError.value = null
  }

  // Upload to Firestore
  async function uploadToCloud(isRetry = false) {
    if (!currentUser.value?.uid) return
    if (isApplying) return  // Don't upload while applying incoming data (prevents loop)
    isSyncing.value = true
    syncError.value = null

    try {
      const data = stripUndefined(collectData())
      // Check size before upload (Firestore limit: 1MB)
      const dataStr = JSON.stringify(data)
      if (dataStr.length > 900000) { // 900KB safety margin
        // Remove profile image to fit
        if (data.settings?.profileImage) {
          data.settings.profileImage = null
        }
      }
      await setDoc(doc(db, 'users', currentUser.value.uid), data)
      lastSynced.value = Date.now()
      localStorage.setItem('floww_last_synced', String(lastSynced.value))
      retryCount = 0
      isSyncing.value = false
    } catch (e) {
      if (retryCount < MAX_RETRIES) {
        retryCount++
        const delay = retryCount * 5000 // 5s, 10s, 15s
        setTimeout(() => uploadToCloud(true), delay)
        // Keep isSyncing true during retry
        return
      }
      syncError.value = e.message
      retryCount = 0
      isSyncing.value = false
    }
  }

  // Download from Firestore with conflict resolution
  async function downloadFromCloud() {
    if (!currentUser.value?.uid) return false
    isSyncing.value = true
    syncError.value = null

    try {
      const snapshot = await getDoc(doc(db, 'users', currentUser.value.uid))
      if (snapshot.exists()) {
        const data = snapshot.data()
        const cloudSyncedAt = data.syncedAt || 0
        const localSyncedAt = lastSynced.value || 0

        if (cloudSyncedAt >= localSyncedAt) {
          // Cloud is newer or same — apply cloud data
          await applyData(data)
          lastSynced.value = cloudSyncedAt
          localStorage.setItem('floww_last_synced', String(cloudSyncedAt))
        } else {
          // Local is newer — upload local data instead
          await uploadToCloud()
        }
        return true
      }
      return false // No data in cloud
    } catch (e) {
      syncError.value = e.message
      return false
    } finally {
      isSyncing.value = false
    }
  }

  // Manual sync (upload)
  async function syncNow() {
    await uploadToCloud()
  }

  // Debounced auto-sync (30 seconds after last change)
  function scheduleAutoSync() {
    if (!autoSyncEnabled.value || !currentUser.value?.uid) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      uploadToCloud()
    }, 30000)
  }

  // Real-time listener — receives changes from other devices instantly
  function startRealtimeSync() {
    if (!currentUser.value?.uid) return
    if (unsubscribeSnapshot) unsubscribeSnapshot()

    unsubscribeSnapshot = onSnapshot(
      doc(db, 'users', currentUser.value.uid),
      async (snapshot) => {
        if (!snapshot.exists()) return
        if (isApplying) return

        const data = snapshot.data()
        const cloudSyncedAt = data.syncedAt || 0
        const localSyncedAt = lastSynced.value || 0

        if (cloudSyncedAt > localSyncedAt) {
          isApplying = true
          try {
            await applyData(data)
            lastSynced.value = cloudSyncedAt
            localStorage.setItem('floww_last_synced', String(cloudSyncedAt))
          } catch (err) {
            console.warn('[FLOWW] Realtime sync apply failed:', err?.message)
          } finally {
            // Brief cooldown prevents the watcher from triggering an immediate
            // upload of the data we just applied (which would create a sync loop).
            // Using a short fixed delay instead of arbitrary 2s.
            await new Promise(r => setTimeout(r, 500))
            isApplying = false
          }
        }
      },
      (error) => {
        syncError.value = error.message
      }
    )
  }

  function stopRealtimeSync() {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot()
      unsubscribeSnapshot = null
    }
  }

  // Watch for store changes (deep — detects edits, not just add/delete)
  let autoSyncWatcher = null

  function startAutoSync() {
    if (autoSyncWatcher) autoSyncWatcher() // Clean up old watcher first
    let lastHash = ''
    autoSyncWatcher = watch(
      () => JSON.stringify({
        eLen: financeStore.expenses.length,
        lLen: financeStore.loans.length,
        gLen: savingsStore.goals.length,
        bLen: buyListStore.items.length,
        pLen: predictedStore.items.length,
        aLen: (financeStore.assets || []).length,
        rLen: (financeStore.recurringSchedules || []).length,
        eHash: financeStore.expenses.reduce((s, e) => s + (e.amount || 0) + (e.status === 'paid' ? 1 : 0) + (e.updatedAt || 0), 0),
        lHash: financeStore.loans.reduce((s, l) => s + (l.monthsPaid || 0) + (l.updatedAt || 0), 0),
        gHash: savingsStore.goals.reduce((s, g) => s + (g.savedAmount || 0) + (g.updatedAt || 0), 0),
        pHash: predictedStore.items.reduce((s, p) => s + (p.amount || 0) + (p.status === 'converted' ? 1 : 0) + (p.updatedAt || 0), 0),
        bLimits: JSON.stringify(financeStore.budgetLimits),
        mInc: JSON.stringify(financeStore.monthlyIncomes),
        tHash: (financeStore.currencyTransfers || []).reduce((s, t) => s + (t.amount || t.usdAmount || 0) + (t.updatedAt || t._updatedAt || 0), 0),
        accHash: [...(accountsStore.accounts || []), ...(accountsStore.incomes || []), ...(accountsStore.corrections || [])]
          .reduce((s, x) => s + (x.updatedAt || 0) + (x.amount || 0), 0) + (accountsStore.accounts || []).length + (accountsStore.incomes || []).length + (accountsStore.corrections || []).length
      }),
      (newHash) => {
        if (newHash !== lastHash) {
          lastHash = newHash
          scheduleAutoSync()
        }
      }
    )
  }

  // Toggle auto-sync and persist preference
  function setAutoSync(enabled) {
    autoSyncEnabled.value = enabled
    localStorage.setItem('floww_auto_sync', String(enabled))
    if (autoSyncWatcher) { autoSyncWatcher(); autoSyncWatcher = null }
    if (enabled) startAutoSync()
  }

  return {
    lastSynced,
    isSyncing,
    syncError,
    autoSyncEnabled,
    uploadToCloud,
    downloadFromCloud,
    syncNow,
    startAutoSync,
    startRealtimeSync,
    stopRealtimeSync,
    setAutoSync,
    clearError
  }
}
