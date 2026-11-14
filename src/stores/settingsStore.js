import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { capacitorStorage } from '../utils/capacitorStorage'
import { registerCustomCategoriesGetter } from '../utils/categoryConfig'
import { hashPin, randomSalt, safeEqual } from '../utils/pinCrypto'

export const useSettingsStore = defineStore('settings', () => {
  const userName = ref('')
  const fxRate = ref({ usdToLkr: 322.50, lastUpdated: null })
  const onboardingComplete = ref(false)
  const tourCompleted = ref(false)
  const incomeData = ref({ salary: 0, sideIncome: 0 })

  const profileImage = ref(null)
  const biometricEnabled = ref(false)
  const budgetAlertsEnabled = ref(true)
  const alertThreshold = ref(80)
  const customCategories = ref([])

  // Register getter so categoryConfig can auto-detect custom categories
  registerCustomCategoriesGetter(() => customCategories.value)
  // The lock PIN is stored only as a PBKDF2-SHA256 hash + random salt — never
  // in plain text. `lockPin` is retained ONLY to migrate legacy plaintext
  // installs (cleared once rehashed) and as a presence flag.
  const savedSplitPeople = ref([])
  const lockPin = ref(null)            // legacy plaintext (migrated away)
  const lockPinHash = ref(null)
  const lockPinSalt = ref(null)
  // Brute-force throttling (persisted so it survives an app restart).
  const lockFailedAttempts = ref(0)
  const lockedUntil = ref(0)
  const authMethod = ref('guest')  // 'google' | 'email' | 'guest'

  const hideTemplates = ref(false)
  const themeMode = ref('system')  // 'system' | 'light' | 'dark'
  const savedLoanTypes = ref(['Personal', 'BNPL', 'Fintech', 'Credit Card', 'Mortgage', 'Vehicle'])
  const savedLenders = ref([])
  const savedExpenseNames = ref([])

  async function fetchFxRate() {
    try {
      const res = await axios.get(
        'https://api.exchangerate-api.com/v4/latest/USD',
        { timeout: 10000 }
      )
      const lkr = Number(res?.data?.rates?.LKR)
      // Sanity-band the response so a spoofed/garbled API can't corrupt every
      // USD↔LKR figure in the app. Keep the last good rate otherwise.
      if (!Number.isFinite(lkr) || lkr < 50 || lkr > 2000) {
        console.warn('FX rate out of range, keeping previous:', lkr)
        return
      }
      fxRate.value = {
        usdToLkr: lkr,
        lastUpdated: Date.now()
      }
    } catch (e) {
      console.warn('FX fetch failed:', e.message || e)
    }
  }

  function shouldRefresh() {
    if (!fxRate.value.lastUpdated) return true
    return Date.now() - fxRate.value.lastUpdated > 3600000
  }

  function setOnboardingComplete() {
    onboardingComplete.value = true
  }

  function setProfileImage(base64) {
    profileImage.value = base64
  }

  function toggleBiometric() {
    biometricEnabled.value = !biometricEnabled.value
  }

  function addCustomCategory(cat) {
    try {
      customCategories.value.push({ ...cat, id: Date.now().toString(36) + Math.random().toString(36).slice(2), createdAt: Date.now() })
    } catch (err) {
      console.error('[FLOWW] addCustomCategory failed:', err?.message || 'Unknown error')
    }
  }

  function removeCustomCategory(identifier) {
    try {
      // Try by ID first, fallback to name
      const before = customCategories.value.length
      customCategories.value = customCategories.value.filter(c =>
        c.id !== identifier && c.name !== identifier
      )
      return { success: customCategories.value.length < before }
    } catch (err) {
      console.error('[FLOWW] removeCustomCategory failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  async function setLockPin(pin) {
    if (!pin) {
      lockPin.value = null
      lockPinHash.value = null
      lockPinSalt.value = null
      lockFailedAttempts.value = 0
      lockedUntil.value = 0
      return
    }
    const salt = randomSalt()
    lockPinSalt.value = salt
    lockPinHash.value = await hashPin(String(pin), salt)
    lockPin.value = null // never keep plaintext
    lockFailedAttempts.value = 0
    lockedUntil.value = 0
  }

  function hasLockPin() {
    return !!lockPinHash.value || !!lockPin.value
  }

  // Lockout schedule: after 5 wrong tries, escalating cooldowns.
  function lockRemainingMs() {
    return Math.max(0, (lockedUntil.value || 0) - Date.now())
  }

  async function verifyLockPin(pin) {
    if (lockRemainingMs() > 0) return { ok: false, lockedMs: lockRemainingMs() }

    // Legacy plaintext migration: accept once, then upgrade to a hash.
    if (lockPin.value != null && lockPin.value !== '') {
      if (String(pin) === String(lockPin.value)) {
        await setLockPin(String(pin))
        return { ok: true }
      }
    } else if (lockPinHash.value && lockPinSalt.value) {
      const h = await hashPin(String(pin), lockPinSalt.value)
      if (safeEqual(h, lockPinHash.value)) {
        lockFailedAttempts.value = 0
        lockedUntil.value = 0
        return { ok: true }
      }
    }

    lockFailedAttempts.value = (lockFailedAttempts.value || 0) + 1
    if (lockFailedAttempts.value >= 5) {
      const over = lockFailedAttempts.value - 5
      const cooldownMs = Math.min(15 * 60_000, 30_000 * Math.pow(2, over)) // 30s→…→15m cap
      lockedUntil.value = Date.now() + cooldownMs
      return { ok: false, lockedMs: cooldownMs }
    }
    return { ok: false, attemptsLeft: 5 - lockFailedAttempts.value }
  }

  function addSavedLoanType(type) {
    if (type && !savedLoanTypes.value.includes(type)) {
      savedLoanTypes.value.push(type)
    }
  }

  function addSavedLender(lender) {
    if (lender && !savedLenders.value.includes(lender)) {
      savedLenders.value.push(lender)
    }
  }

  function addSavedExpenseName(name) {
    try {
      if (!name) return
      // Support both old string[] format and new {name, count}[] format
      const trimmed = name.trim()
      const existing = savedExpenseNames.value.find(
        item => (typeof item === 'string' ? item : item.name) === trimmed
      )
      if (existing) {
        // Migrate string to object or increment count
        if (typeof existing === 'string') {
          const idx = savedExpenseNames.value.indexOf(existing)
          savedExpenseNames.value[idx] = { name: trimmed, count: 2 }
        } else {
          existing.count = (existing.count || 1) + 1
        }
      } else {
        savedExpenseNames.value.push({ name: trimmed, count: 1 })
      }
    } catch (err) {
      console.error('[FLOWW] addSavedExpenseName failed:', err?.message || 'Unknown error')
    }
  }

  // Get sorted expense names (most used first)
  function getSortedExpenseNames() {
    return [...savedExpenseNames.value]
      .map(item => typeof item === 'string' ? { name: item, count: 1 } : item)
      .sort((a, b) => b.count - a.count)
      .map(item => item.name)
  }

  function normalizeSavedNames() {
    savedExpenseNames.value = savedExpenseNames.value.map(item => {
      if (typeof item === 'string') return { name: item, count: 1 }
      return item
    })
  }
  // Normalize on store init
  normalizeSavedNames()

  return {
    userName,
    fxRate,
    onboardingComplete,
    tourCompleted,
    incomeData,
    profileImage,
    biometricEnabled,
    budgetAlertsEnabled,
    alertThreshold,
    customCategories,
    lockPin,
    lockPinHash,
    lockPinSalt,
    lockFailedAttempts,
    lockedUntil,
    hasLockPin,
    verifyLockPin,
    lockRemainingMs,
    fetchFxRate,
    shouldRefresh,
    setOnboardingComplete,
    setProfileImage,
    toggleBiometric,
    addCustomCategory,
    removeCustomCategory,
    setLockPin,
    savedLoanTypes,
    savedLenders,
    savedExpenseNames,
    savedSplitPeople,
    addSavedLoanType,
    addSavedLender,
    addSavedExpenseName,
    getSortedExpenseNames,
    authMethod,
    hideTemplates,
    themeMode
  }
}, { persist: { storage: capacitorStorage } })
