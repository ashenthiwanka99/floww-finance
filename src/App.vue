<template>
  <SplashScreen :show="showSplash" />
  <LockScreen
    v-if="showLock"
    :visible="showLock"
    @unlock="onUnlock"
  />
  <router-view v-if="appReady" />
</template>

<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { format, startOfDay } from 'date-fns'
import { useFinanceStore } from './stores/financeStore'
import { useSettingsStore } from './stores/settingsStore'
import { useSavingsStore } from './stores/savingsStore'
import { useBuyListStore } from './stores/buyListStore'
import { useCreditCardStore } from './stores/creditCardStore'
import { useSmsImportStore } from './stores/smsImportStore'
import { useAccountsStore } from './stores/accountsStore'
import { initNotifications, scheduleAllNotifications } from './composables/useNotifications'
import { checkDataIntegrity } from './utils/dataIntegrity'
import { showToast } from './utils/toast'
import { useAuth } from './composables/useAuth'
import { useCloudSync } from './composables/useCloudSync'
import { initTheme } from './composables/useTheme'
import { useWidget } from './composables/useWidget'
import { useSmsInbox } from './composables/useSmsInbox'
import { App as CapApp } from '@capacitor/app'
import SplashScreen from './components/shared/SplashScreen.vue'
import LockScreen from './components/shared/LockScreen.vue'
import { hasBackConsumer } from './utils/backGuard'

const router = useRouter()

// Hardware back button: go to dashboard, or exit if already there.
// If a bottom sheet is open, its own back listener handles the close —
// don't also navigate (that would yank the user off their page).
CapApp.addListener('backButton', () => {
  if (hasBackConsumer()) return
  const path = router.currentRoute.value.path
  if (path === '/' || path === '/welcome' || path === '/onboarding') {
    CapApp.exitApp()
  } else if (window.history.state?.back && !['/expenses', '/bills', '/more'].includes(path)) {
    router.back()
  } else {
    router.push('/')
  }
})

const showSplash = ref(true)
const isUnlocked = ref(false)
const splashDone = ref(false)

const finance = useFinanceStore()
const settings = useSettingsStore()
const savings = useSavingsStore()
const buyList = useBuyListStore()
const creditCards = useCreditCardStore()
const smsImport = useSmsImportStore()
const accountsStore = useAccountsStore()

initTheme()

const showLock = computed(() =>
  splashDone.value && settings.biometricEnabled && !isUnlocked.value
)

const appReady = computed(() =>
  !showSplash.value && (!settings.biometricEnabled || isUnlocked.value)
)

function onUnlock() {
  isUnlocked.value = true
}

function checkAndGenerateRecurring() {
  finance.syncBudgetMonth()
}

onMounted(async () => {
  // Guard flag: prevents multiple routing actions from racing
  let routingHandled = false

  const { currentUser, isLoading: authLoading } = useAuth()

  // Single routing function with guard
  async function handleStartupRouting() {
    if (routingHandled) return
    if (settings.onboardingComplete) {
      // Already onboarded — proceed to dashboard, try cloud sync
      routingHandled = true
      if (currentUser.value) {
        try {
          const { downloadFromCloud, startAutoSync, startRealtimeSync, autoSyncEnabled } = useCloudSync()
          if (autoSyncEnabled.value) {
            await downloadFromCloud()
            startRealtimeSync()
            startAutoSync()
          }
        } catch {}
      }
      return
    }

    // Not onboarded yet
    if (currentUser.value) {
      // Signed in (possibly from Google redirect) — try cloud restore
      routingHandled = true
      try {
        const { downloadFromCloud, startAutoSync, startRealtimeSync } = useCloudSync()
        const hasData = await downloadFromCloud()
        if (hasData && settings.onboardingComplete) {
          startRealtimeSync()
          startAutoSync()
          router.replace('/')
          return
        }
      } catch {}
      // Pre-fill from Google/Firebase profile
      if (currentUser.value) {
        if (currentUser.value.displayName) settings.userName = currentUser.value.displayName
        if (currentUser.value.photoURL) {
          try {
            const res = await fetch(currentUser.value.photoURL)
            const blob = await res.blob()
            const reader = new FileReader()
            reader.onloadend = () => { settings.profileImage = reader.result }
            reader.readAsDataURL(blob)
          } catch {
            // Don't fall back to raw URL — it fails in Capacitor WebView
          }
        }
        if (currentUser.value.providerData?.[0]?.providerId === 'google.com') {
          settings.authMethod = 'google'
        }
      }
      router.replace('/onboarding')
    } else if (settings.authMethod === 'guest' && router.currentRoute.value.path === '/onboarding') {
      routingHandled = true
      // Guest already going to onboarding — let it be
    } else {
      routingHandled = true
      router.replace('/welcome')
    }
  }

  // Wait for Firebase auth to initialize, then route
  if (authLoading.value) {
    const unwatch = watch(authLoading, (loading) => {
      if (!loading) {
        unwatch()
        handleStartupRouting()
      }
    })
  } else {
    await handleStartupRouting()
  }

  // Fallback: if auth state changes later (Google redirect return), handle it
  if (!routingHandled) {
    watch(currentUser, () => {
      handleStartupRouting()
    }, { once: true })
  }

  // Fetch FX rate if stale
  if (settings.shouldRefresh()) {
    settings.fetchFxRate()
  }

  // Auto-update overdue status
  const todayStart = startOfDay(new Date())
  finance.expenses.forEach(e => {
    if (e.status !== 'paid' && e.dueDate && new Date(e.dueDate) < todayStart) {
      finance.markAsOverdue(e.id)
    }
  })

  // Strip any legacy auto-set carryovers from prior versions — carryover is
  // manual-only now. Idempotent after the first run.
  finance.purgeAutoCarryovers()

  // Stamp source-SMS fingerprints onto pre-existing imported expenses while
  // the legacy smsImport cache is still populated on this boot — once it
  // does so the new derived `importedFromExpenses` set keeps them marked
  // even after smsImport gets wiped by an unreliable native write.
  finance.backfillSmsFingerprints(smsImport.importedFingerprints)

  // Anchor existing expenses' createdAt to their dueDate so "sort by added"
  // produces a sensible legacy order. Idempotent — guarded by a persisted
  // flag, so it won't trample future Date.now() stamps on new expenses.
  finance.migrateCreatedAtToDueDate()

  // Check and generate recurring expenses
  checkAndGenerateRecurring()

  // Data integrity check
  const integrityIssues = checkDataIntegrity(finance, savings, buyList, settings, creditCards, accountsStore)
  if (integrityIssues.length > 0) {
    console.warn('[FLOWW] Data integrity fixes:', integrityIssues)
  }

  // Auto-sync on startup if user is logged in
  try {
    const { currentUser } = useAuth()
    const { downloadFromCloud, startAutoSync, startRealtimeSync, autoSyncEnabled } = useCloudSync()
    if (currentUser.value && autoSyncEnabled.value) {
      await downloadFromCloud()
      startRealtimeSync()
      startAutoSync()
    }
  } catch {}

  useWidget().updateWidget()
  useSmsInbox().autoScan()
  CapApp.addListener('resume', () => useSmsInbox().autoScan())

  // Schedule local push notifications (budget alerts handled via push only)
  initNotifications().then(granted => {
    if (granted) {
      scheduleAllNotifications()
    }
  })

  setTimeout(() => {
    showSplash.value = false
    splashDone.value = true

  }, 600)
})
</script>
