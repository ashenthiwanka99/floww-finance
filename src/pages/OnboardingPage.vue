<template>
  <div class="onboarding">
    <div class="onboarding__brand">
      <img src="/floww-mark.svg" alt="" width="40" height="40" />
      <p class="onboarding__name">Floww</p>
    </div>

    <p class="onboarding__progress num">Step {{ step }} of {{ STEPS }}</p>
    <div class="track onboarding__track" role="progressbar" :aria-valuenow="step" aria-valuemin="1" :aria-valuemax="STEPS">
      <span class="fill" :style="{ width: (step / STEPS) * 100 + '%' }" />
    </div>

    <h1 class="onboarding__title">{{ stepTitle }}</h1>

    <section v-if="step === 1">
      <p class="page-sub">Floww tracks your salary cycle, bills and spending in LKR.</p>
      <div class="field">
        <label class="field-label" for="ob-name">Your name</label>
        <input
          id="ob-name"
          v-model="userName"
          type="text"
          autocomplete="given-name"
          class="field-input"
          :class="{ 'field-error': fieldErrors.name }"
          :aria-describedby="fieldErrors.name ? 'ob-name-err' : undefined"
          @input="clearError('name')"
          @keydown.enter="next"
        />
        <p v-if="fieldErrors.name" id="ob-name-err" class="field-error-msg">{{ fieldErrors.name }}</p>
      </div>
    </section>

    <section v-else-if="step === 2">
      <p class="page-sub">If you are paid in dollars, Floww converts it to rupees at the current rate.</p>
      <div class="list" role="radiogroup" aria-label="Salary currency">
        <button
          v-for="c in [{ code: 'LKR', name: 'Sri Lankan rupee' }, { code: 'USD', name: 'US dollar' }]"
          :key="c.code"
          class="row"
          role="radio"
          :aria-checked="salaryCurrency === c.code"
          @click="salaryCurrency = c.code"
        >
          <span class="row__main">
            <span class="row__title">{{ c.code }}</span>
            <span class="row__meta">{{ c.name }}</span>
          </span>
          <span class="material-symbols-outlined onboarding__radio">{{ salaryCurrency === c.code ? 'radio_button_checked' : 'radio_button_unchecked' }}</span>
        </button>
      </div>
    </section>

    <section v-else-if="step === 3">
      <p class="page-sub">This sets your first budget. You can change it any time under Income.</p>
      <div class="field">
        <label class="field-label" for="ob-salary">Monthly salary ({{ salaryCurrency }})</label>
        <MoneyInput id="ob-salary" v-model="salary" class="field-input num" :placeholder="salaryCurrency === 'USD' ? '1,450' : '165,000'" />
        <p v-if="salaryCurrency === 'USD' && salary" class="field-help num">About LKR {{ formatMoney(Math.round(salary * fxRate)) }} at {{ fxRate.toFixed(2) }}</p>
      </div>
      <div class="field">
        <label class="field-label" for="ob-side">Side income in LKR, optional</label>
        <MoneyInput id="ob-side" v-model="sideIncome" class="field-input num" placeholder="0" />
      </div>
    </section>

    <section v-else>
      <p class="page-sub">Optional. Floww warns you as a category gets close to its limit.</p>
      <div class="list">
        <label v-for="cat in budgetCategories" :key="cat.key" class="row onboarding__limit">
          <span class="row__icon material-symbols-outlined">{{ cat.icon }}</span>
          <span class="row__main row__title">{{ cat.name }}</span>
          <MoneyInput v-model="budgetLimits[cat.key]" class="field-input num onboarding__limit-input" placeholder="None" :aria-label="`${cat.name} limit in LKR`" />
        </label>
      </div>
    </section>

    <div class="onboarding__footer">
      <div class="btn-row">
        <button v-if="step > 1" class="btn btn--outline" @click="step--">Back</button>
        <button class="btn btn--primary" @click="next">{{ step < STEPS ? 'Next' : 'Start tracking' }}</button>
      </div>
      <button class="btn btn--ghost btn--block onboarding__skip" @click="handleSkip">Skip, I will add my income later</button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { format } from 'date-fns'
import MoneyInput from '../components/shared/MoneyInput.vue'
import { useRouter } from 'vue-router'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSavingsStore } from '../stores/savingsStore'
import { useBuyListStore } from '../stores/buyListStore'
import { formatMoney, getBudgetMonth } from '../utils/format'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { currentUser } = useAuth()
const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()
const savingsStore = useSavingsStore()
const buyListStore = useBuyListStore()

const salaryCurrency = ref('LKR')
const salary = ref(null)
const sideIncome = ref(null)
const userName = ref('')
const fxRate = computed(() => settingsStore.fxRate.usdToLkr || 322.50)

const budgetLimits = reactive({
  bills: null,
  groceries: null,
  dining: null,
  transport: null,
  subscriptions: null
})

const budgetCategories = [
  { key: 'bills', name: 'Bills', icon: 'receipt_long' },
  { key: 'groceries', name: 'Groceries', icon: 'shopping_basket' },
  { key: 'dining', name: 'Dining', icon: 'restaurant' },
  { key: 'transport', name: 'Transport', icon: 'directions_car' },
  { key: 'subscriptions', name: 'Subscriptions', icon: 'subscriptions' }
]

onMounted(async () => {
  // Pre-fill from Google/Firebase profile
  if (currentUser.value?.displayName && !userName.value) {
    userName.value = currentUser.value.displayName
  } else if (settingsStore.userName) {
    userName.value = settingsStore.userName
  }

  // Pre-fill profile image from Google — convert to base64 for offline
  if (currentUser.value?.photoURL && !settingsStore.profileImage) {
    try {
      const url = currentUser.value.photoURL
      const res = await fetch(url)
      const blob = await res.blob()
      const reader = new FileReader()
      reader.onloadend = () => { settingsStore.profileImage = reader.result }
      reader.readAsDataURL(blob)
    } catch {
      // Don't fall back to raw URL
    }
  }
})

const fieldErrors = reactive({})

function clearError(field) { delete fieldErrors[field] }

const STEPS = 4
const step = ref(1)
const stepTitle = computed(() => ({
  1: 'What should we call you?',
  2: 'Which currency is your salary paid in?',
  3: 'What is your monthly income?',
  4: 'Set spending limits'
})[step.value])

function next() {
  if (step.value === 1 && !userName.value?.trim()) {
    fieldErrors.name = 'Name is required'
    return
  }
  if (step.value < STEPS) step.value++
  else finish()
}

function finish() {
  handleComplete()
  if (fieldErrors.name) step.value = 1
}

function handleSkip() {
  settingsStore.userName = userName.value?.trim() || 'there'
  settingsStore.setOnboardingComplete()
  financeStore.initialized = true
  router.replace('/')
}

function handleComplete() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!userName.value?.trim()) {
    fieldErrors.name = 'Name is required'
    return
  }
  const salaryRaw = salary.value || 0
  const sideRaw = sideIncome.value || 0

  // Calculate LKR salary
  const lkrSalary = salaryCurrency.value === 'USD'
    ? Math.round(salaryRaw * fxRate.value)
    : salaryRaw

  // Save income to financeStore
  financeStore.income.salary = lkrSalary
  financeStore.income.sideIncome = sideRaw

  // Save to monthly income — today opens the first budget cycle
  const currentMonth = getBudgetMonth()
  financeStore.setMonthlyIncome(currentMonth, {
    usdAmount: salaryCurrency.value === 'USD' ? salaryRaw : 0,
    fxRate: fxRate.value,
    lkrSalary: lkrSalary,
    sideIncome: sideRaw,
    total: lkrSalary + sideRaw,
    currency: salaryCurrency.value,
    receivedDate: format(new Date(), 'yyyy-MM-dd'),
    date: Date.now()
  })

  // Save budget limits to financeStore
  Object.keys(budgetLimits).forEach(key => {
    financeStore.budgetLimits[key] = budgetLimits[key] || 0
  })

  // Save to settingsStore
  settingsStore.userName = userName.value || 'User'
  settingsStore.incomeData.salary = salaryRaw
  settingsStore.incomeData.sideIncome = sideRaw
  settingsStore.incomeData.currency = salaryCurrency.value

  // Mark onboarding as complete
  settingsStore.setOnboardingComplete()
  financeStore.initialized = true

  // Navigate to dashboard
  router.replace('/')
}
</script>

<style lang="scss" scoped>
.onboarding {
  min-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: calc(32px + env(safe-area-inset-top, 0px)) var(--gutter) calc(16px + env(safe-area-inset-bottom, 0px));
}

.onboarding__brand { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
.onboarding__name { font-size: var(--fs-section); font-weight: 600; }

.onboarding__progress { font-size: var(--fs-small); color: var(--muted); }
.onboarding__track { margin: 6px 0 24px; height: 4px; }

.onboarding__title { font-size: var(--fs-title); line-height: 30px; font-weight: 600; }
.onboarding .page-sub { margin: 4px 0 24px; }

.onboarding__radio { color: var(--text); }

.onboarding__limit { cursor: default; }
.onboarding__limit-input { width: 132px; flex: none; text-align: right; }

.onboarding__footer { margin-top: auto; padding-top: 24px; }
.onboarding__skip { margin-top: 8px; color: var(--muted); }
</style>
