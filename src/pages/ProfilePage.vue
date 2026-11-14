<template>
  <q-page>
    <PageHead title="Profile and preferences" back />

    <section class="panel panel--pad account">
      <button class="account__photo" aria-label="Change photo" @click="triggerFileInput">
        <img v-if="settingsStore.profileImage && !profileImgError" :src="settingsStore.profileImage" alt="" @error="profileImgError = true" />
        <span v-else class="material-symbols-outlined">add_a_photo</span>
      </button>
      <input ref="fileInput" type="file" accept="image/*" class="hidden-input" @change="handleImageUpload" />
      <div class="account__main">
        <label class="field-label" for="profile-name">Name</label>
        <input id="profile-name" v-model="tempName" type="text" autocomplete="name" class="field-input" @blur="saveName" @keydown.enter="$event.target.blur()" />
        <p class="field-help">
          <template v-if="settingsStore.authMethod === 'google'">Signed in with Google{{ currentUser?.email ? ` as ${currentUser.email}` : '' }}</template>
          <template v-else-if="settingsStore.authMethod === 'email'">Signed in{{ currentUser?.email ? ` as ${currentUser.email}` : ' with email' }}</template>
          <template v-else>Guest. Your data is only on this phone.</template>
        </p>
      </div>
      <button v-if="settingsStore.authMethod === 'guest'" class="btn btn--outline btn--block account__action" @click="showLinkSheet = true">Link an account</button>
      <button v-else class="btn btn--outline btn--block account__action" @click="handleSignOut">Sign out</button>
    </section>

    <section class="section">
      <div class="section-head"><h2 id="appearance-label">Appearance</h2></div>
      <p class="settings-desc">Home-screen widgets follow your phone's dark mode.</p>
      <div class="seg seg--block" role="group" aria-labelledby="appearance-label">
        <button
          v-for="opt in themeOptions"
          :key="opt.value"
          type="button"
          :aria-pressed="settingsStore.themeMode === opt.value"
          @click="settingsStore.themeMode = opt.value"
        >{{ opt.label }}</button>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Notifications</h2></div>
      <p class="settings-desc">A notification when a category gets close to its spending limit.</p>
      <div class="panel settings-panel">
        <div class="switch-row">
          <div class="switch-row__text"><p class="switch-row__title">Budget alerts</p></div>
          <button
            class="switch"
            role="switch"
            :aria-checked="settingsStore.budgetAlertsEnabled"
            aria-label="Budget alerts"
            @click="settingsStore.budgetAlertsEnabled = !settingsStore.budgetAlertsEnabled"
          />
        </div>
        <div v-if="settingsStore.budgetAlertsEnabled" class="field threshold">
          <label class="field-label" for="alert-threshold">Alert at this share of the limit</label>
          <div class="money-wrap threshold__input">
            <input id="alert-threshold" v-model.number="settingsStore.alertThreshold" type="number" inputmode="numeric" min="1" max="100" class="money-input num" aria-describedby="alert-threshold-help" />
            <span class="money-lkr">%</span>
          </div>
          <p id="alert-threshold-help" class="field-help">Between 1 and 100.</p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Security</h2></div>
      <p class="settings-desc">Ask for your PIN or fingerprint every time Floww opens.</p>
      <div class="panel settings-panel">
        <div class="switch-row">
          <div class="switch-row__text"><p class="switch-row__title">App lock</p></div>
          <button
            class="switch"
            role="switch"
            :aria-checked="settingsStore.biometricEnabled"
            aria-label="App lock"
            @click="settingsStore.toggleBiometric()"
          />
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Suggestions</h2></div>
      <p class="settings-desc">Names, lenders and loan types Floww remembers to fill forms faster.</p>
      <div class="list">
        <button class="row" :disabled="!settingsStore.savedExpenseNames.length" @click="resetSuggestions">
          <span class="row__main">
            <span class="row__title">Clear expense name suggestions</span>
            <span class="row__meta num">{{ settingsStore.savedExpenseNames.length }} saved</span>
          </span>
        </button>
        <button class="row" @click="resetLoanData">
          <span class="row__main">
            <span class="row__title">Clear saved lenders and loan types</span>
            <span class="row__meta num">{{ settingsStore.savedLenders.length + settingsStore.savedLoanTypes.length }} saved</span>
          </span>
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Reset</h2></div>
      <p class="settings-desc">Start again from the welcome screen.</p>
      <button class="btn btn--danger btn--block" @click="showResetConfirm = true">Reset all data</button>
    </section>

    <BottomSheet v-model="showLinkSheet" title="Link an account">
      <p>Your data syncs to the cloud, so a new phone picks up where you left off.</p>
      <div class="sheet-actions">
        <button class="btn btn--primary btn--block" @click="handleLinkGoogle">Continue with Google</button>
        <button class="btn btn--outline btn--block" @click="$router.push('/signup'); showLinkSheet = false">Create an email account</button>
      </div>
    </BottomSheet>

    <BottomSheet v-model="showResetConfirm" title="Reset all data?">
      <p>This deletes your expenses, income, loans, spending limits, categories, saved suggestions, PIN and name on this phone. It cannot be undone.</p>
      <div class="btn-row">
        <button class="btn btn--outline" @click="showResetConfirm = false">Cancel</button>
        <button class="btn btn--danger" @click="handleResetAll">Delete everything</button>
      </div>
    </BottomSheet>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '../stores/settingsStore'
import { useFinanceStore } from '../stores/financeStore'
import { useSavingsStore } from '../stores/savingsStore'
import { useBuyListStore } from '../stores/buyListStore'
import { useAuth } from '../composables/useAuth'
import { useCloudSync } from '../composables/useCloudSync'
import BottomSheet from '../components/shared/BottomSheet.vue'
import { showToast } from '../utils/toast'
import PageHead from '../components/layout/PageHead.vue'

const router = useRouter()
const { currentUser, signInWithGoogle, signOut } = useAuth()
const { stopRealtimeSync } = useCloudSync()
const settingsStore = useSettingsStore()
const financeStore = useFinanceStore()
const savingsStore = useSavingsStore()
const profileImgError = ref(false)
const buyListStore = useBuyListStore()

const themeOptions = [
  { value: 'system', label: 'Match phone' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

// Avatar
const fileInput = ref(null)

function triggerFileInput() {
  fileInput.value?.click()
}

function handleImageUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 1024 * 1024) {
    showToast('Image too large. Max 1MB.', 'error')
    event.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = (e) => {
    settingsStore.setProfileImage(e.target.result)
    showToast('Profile photo updated')
  }
  reader.onerror = () => {
    showToast('Failed to read image', 'error')
  }
  reader.readAsDataURL(file)
  event.target.value = ''
}

// Name
const tempName = ref(settingsStore.userName)

function saveName() {
  const trimmed = tempName.value.trim()
  if (trimmed) settingsStore.userName = trimmed
  else tempName.value = settingsStore.userName
}

// Link account
const showLinkSheet = ref(false)

async function handleLinkGoogle() {
  try {
    await signInWithGoogle()
    settingsStore.authMethod = 'google'
    showLinkSheet.value = false
    // Upload current data to cloud
    const { syncNow, startAutoSync } = useCloudSync()
    await syncNow()
    startAutoSync()
    showToast('Account linked and synced')
  } catch (err) {
    showToast(err?.message || 'Failed to link account', 'error')
  }
}

async function handleSignOut() {
  stopRealtimeSync()
  await signOut()
  settingsStore.authMethod = 'guest'
  showToast('Signed out', 'info')
  router.replace('/welcome')
}

// Preferences
function resetSuggestions() {
  settingsStore.savedExpenseNames = []
  showToast('Name suggestions cleared', 'info')
}

function resetLoanData() {
  settingsStore.savedLoanTypes = []
  settingsStore.savedLenders = []
  showToast('Saved lenders and loan types cleared', 'info')
}

// Reset
const showResetConfirm = ref(false)

function handleResetAll() {
  // Clear finance store completely
  financeStore.income = { salary: 0, sideIncome: 0, other: [] }
  financeStore.expenses = []
  financeStore.loans = []
  financeStore.loanDisbursements = []
  financeStore.monthlyIncomes = {}
  financeStore.budgetLimits = {
    bills: 0, groceries: 0, dining: 0, subscriptions: 0,
    transport: 0, personalCare: 0, healthcare: 0
  }
  financeStore.currentMonth = new Date().toISOString().slice(0, 7)
  financeStore.lastRecurringGenMonth = null
  financeStore.initialized = false

  // Clear savings
  savingsStore.goals = []

  // Clear buy list
  buyListStore.items = []

  // Clear settings completely
  settingsStore.userName = ''
  settingsStore.profileImage = null
  settingsStore.biometricEnabled = false
  settingsStore.budgetAlertsEnabled = true
  settingsStore.alertThreshold = 80
  settingsStore.customCategories = []
  settingsStore.savedExpenseNames = []
  settingsStore.savedLoanTypes = ['Personal', 'BNPL', 'Fintech']
  settingsStore.savedLenders = []
  settingsStore.lockPin = null
  settingsStore.lockPinHash = null
  settingsStore.lockPinSalt = null
  settingsStore.lockFailedAttempts = 0
  settingsStore.lockedUntil = 0
  settingsStore.fxRate = { usdToLkr: 322.50, lastUpdated: null }
  settingsStore.incomeData = { salary: 0, sideIncome: 0 }
  settingsStore.onboardingComplete = false
  settingsStore.tourCompleted = false
  settingsStore.authMethod = 'guest'

  // Clear sync state
  localStorage.removeItem('floww_last_synced')
  localStorage.removeItem('floww_auto_sync')
  localStorage.removeItem('floww_last_backup')

  showResetConfirm.value = false
  router.replace('/welcome')
}
</script>

<style lang="scss" scoped>
.account {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 16px;
  align-items: start;
}

.account__photo {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 0;
  padding: 0;
  overflow: hidden;
  background: var(--raised);
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  img { width: 100%; height: 100%; object-fit: cover; }
}

.account__action { grid-column: 1 / -1; }

.settings-desc { color: var(--muted); margin: -4px 0 8px; }
.settings-panel { padding: 4px var(--card-pad); }
.threshold { margin: 0 0 16px; }
.threshold__input { width: 120px; }

.sheet-actions { display: grid; gap: 8px; margin-top: 16px; }
.hidden-input { display: none; }
</style>
