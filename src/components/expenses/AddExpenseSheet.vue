<template>
  <BottomSheet
    :model-value="modelValue"
    :title="sheetTitle"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="accounts.tracking" class="seg seg--block add-modes" role="group" aria-label="What to record">
      <button type="button" :aria-pressed="mode === 'expense'" @click="mode = 'expense'">Expense</button>
      <button type="button" :aria-pressed="mode === 'income'" @click="mode = 'income'">Money in</button>
      <button type="button" :aria-pressed="mode === 'move'" @click="mode = 'move'">Move</button>
    </div>

    <form v-if="mode === 'income'" class="xform" novalidate @submit.prevent="saveIncomeMode">
      <IncomeFields :form="incomeForm" :errors="otherErrors" uid="add-income" />
      <p v-if="otherErrors.form" class="field-error-msg">{{ otherErrors.form }}</p>
      <button type="submit" class="btn btn--primary btn--block xform__save">{{ incomeForm.kind === 'salary' ? 'Save salary' : 'Save money in' }}</button>
    </form>

    <form v-else-if="mode === 'move'" class="xform" novalidate @submit.prevent="saveMoveMode">
      <TransferFields :form="moveForm" :errors="otherErrors" uid="add-move" />
      <p v-if="otherErrors.form" class="field-error-msg">{{ otherErrors.form }}</p>
      <button type="submit" class="btn btn--primary btn--block xform__save">Save move</button>
    </form>

    <template v-else>
    <router-link to="/sms-import" class="row sms-entry" @click="$emit('update:modelValue', false)">
      <span class="row__icon material-symbols-outlined">sms</span>
      <span class="row__main">
        <span class="row__title">{{ smsCount ? `${smsCount} new from bank SMS` : 'Add from bank SMS' }}</span>
        <span class="row__meta">{{ smsCount ? 'Add them in one tap' : 'Commercial Bank and Nations Trust Bank' }}</span>
      </span>
      <span class="row__chev material-symbols-outlined">chevron_right</span>
    </router-link>

    <QuickTemplates class="sheet-templates" @select="applyTemplate" />

    <form class="xform" novalidate @submit.prevent="handleSave">
      <div v-if="!form.isInstallment" class="field">
        <div class="xform__label-row">
          <label class="field-label" for="add-amount">{{ amountLabel }}</label>
          <div v-if="!isFuel" class="seg" role="group" aria-label="Currency">
            <button type="button" :aria-pressed="expCurrency === 'LKR'" @click="expCurrency = 'LKR'">LKR</button>
            <button type="button" :aria-pressed="expCurrency === 'USD'" @click="expCurrency = 'USD'">USD</button>
          </div>
        </div>
        <div class="money-wrap xform__amount" :class="{ 'money-wrap--error': !!fieldErrors.amount }">
          <span class="money-lkr">{{ isFuel ? 'LKR' : expCurrency }}</span>
          <MoneyInput
            v-if="isFuel"
            id="add-amount"
            v-model="form.amount"
            placeholder="0"
            :error="false"
            @update:model-value="clearError('amount')"
          />
          <MoneyInput
            v-else
            id="add-amount"
            v-model="expInputAmount"
            placeholder="0"
            :error="false"
            @update:model-value="onExpAmountChange"
          />
        </div>
        <p v-if="!isFuel && expCurrency === 'USD' && expInputAmount > 0" class="field-help num">
          LKR {{ formatMoney(expConvertedLKR) }} at {{ expFxRate }}
        </p>
        <p v-if="fieldErrors.amount" class="field-error-msg">{{ fieldErrors.amount }}</p>
      </div>

      <div class="field">
        <label class="field-label" for="add-name">{{ isLend ? 'Lent to' : 'Name' }}</label>
        <div class="input-with-clear">
          <input
            id="add-name"
            v-model="form.name"
            type="text"
            class="field-input"
            :class="{ 'field-error': fieldErrors.name }"
            :placeholder="isLend ? 'Who has the money' : 'What was it for'"
            autocomplete="off"
            @input="clearError('name')"
          />
          <button v-if="form.name" type="button" class="field-clear" aria-label="Clear name" @click="form.name = ''">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <p v-if="fieldErrors.name" class="field-error-msg">{{ fieldErrors.name }}</p>
        <div v-if="nameSuggestions.length" :key="'name-' + form.name" class="smart-chips xform__suggest">
          <button v-for="s in nameSuggestions" :key="s" type="button" class="chip" @click="form.name = s">{{ s }}</button>
        </div>
      </div>

      <div class="field">
        <p class="field-label">Category</p>
        <div class="chips xform__wrap" role="radiogroup" aria-label="Category">
          <button
            v-for="cat in (showAllCategories ? [...visibleCategories, ...hiddenCategories] : visibleCategories)"
            :key="cat"
            type="button"
            role="radio"
            class="chip"
            :class="{ on: form.category === cat }"
            :aria-checked="form.category === cat"
            @click="selectCategory(cat)"
          >{{ categoryLabel(cat) }}</button>
          <button
            v-if="hiddenCategories.length"
            type="button"
            class="chip xform__chip-more"
            :aria-expanded="showAllCategories"
            @click="showAllCategories = !showAllCategories"
          >{{ showAllCategories ? 'Fewer' : `${hiddenCategories.length} more` }}</button>
        </div>
        <input
          v-if="showAllCategories"
          v-model="form.category"
          type="text"
          class="field-input xform__custom-cat"
          placeholder="Or type a new category"
          aria-label="New category"
          @input="clearError('category')"
        />
        <p v-if="fieldErrors.category" class="field-error-msg">{{ fieldErrors.category }}</p>
      </div>

      <div class="field">
        <label class="field-label" for="add-date">{{ dateLabel }}</label>
        <input
          id="add-date"
          v-model="form.dueDate"
          type="date"
          class="field-input num"
          :class="{ 'field-error': fieldErrors.dueDate }"
          :min="dateMin"
          @input="clearError('dueDate')"
        />
        <p v-if="fieldErrors.dueDate" class="field-error-msg">{{ fieldErrors.dueDate }}</p>
      </div>

      <template v-if="isFuel">
        <div class="field-row">
          <div class="field">
            <label class="field-label" for="add-fuel-price">Price per litre</label>
            <input
              id="add-fuel-price"
              v-model.number="form.fuelPricePerLiter"
              type="number"
              inputmode="decimal"
              step="0.01"
              class="field-input num"
              :class="{ 'field-error': fieldErrors.fuelPricePerLiter }"
              placeholder="LKR"
              @input="clearError('fuelPricePerLiter')"
            />
            <p v-if="fieldErrors.fuelPricePerLiter" class="field-error-msg">{{ fieldErrors.fuelPricePerLiter }}</p>
          </div>
          <div class="field">
            <p class="field-label">Litres</p>
            <p class="xform__readout num">{{ computedLiters }} L</p>
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="add-odo">Odometer, optional</label>
          <input id="add-odo" v-model.number="form.fuelOdometer" type="number" inputmode="numeric" class="field-input num" placeholder="km" />
        </div>
      </template>

      <template v-if="isLend">
        <div class="switch-row">
          <span class="switch-row__text">
            <span class="switch-row__title">Remind me to collect</span>
          </span>
          <button
            type="button"
            role="switch"
            class="switch"
            :aria-checked="form.hasCollectionReminder"
            aria-label="Remind me to collect"
            @click="form.hasCollectionReminder = !form.hasCollectionReminder"
          />
        </div>
        <div v-if="form.hasCollectionReminder" class="field">
          <label class="field-label" for="add-collect">Remind on</label>
          <input id="add-collect" v-model="form.collectionDate" type="date" class="field-input num" />
        </div>
      </template>

      <div v-if="showPaidToggle" class="switch-row">
        <span class="switch-row__text">
          <span class="switch-row__title">Paid</span>
          <span class="switch-row__desc">{{ form.isPaid ? 'Already paid' : 'Still to pay, shows in Bills' }}</span>
        </span>
        <button
          type="button"
          role="switch"
          class="switch"
          :aria-checked="form.isPaid"
          aria-label="Paid"
          @click="form.isPaid = !form.isPaid; paidTouched = true"
        />
      </div>

      <div v-if="showSourcePicker" class="field">
        <p class="field-label">{{ sourceLabel }}</p>
        <AccountPicker v-model="source" :cards="!isLend" :label="sourceLabel" />
      </div>

      <div class="xform__more">
        <button
          v-if="!usesMoreOptions"
          type="button"
          class="xform__more-toggle"
          :aria-expanded="showMore"
          @click="moreOpen = !moreOpen"
        >
          <span>
            <span class="xform__more-title">More options</span>
            <span class="xform__more-sub">{{ moreSummary }}</span>
          </span>
          <span class="material-symbols-outlined">{{ showMore ? 'expand_less' : 'expand_more' }}</span>
        </button>
        <p v-else class="xform__more-title xform__more-head">More options</p>

        <div v-if="showMore" class="xform__more-body">
          <div v-if="showTypeSelector" class="field">
            <p class="field-label">How it is paid</p>
            <div class="seg seg--block" role="group" aria-label="How it is paid">
              <button
                v-for="t in typeOptions"
                :key="t.value"
                type="button"
                :aria-pressed="expenseType === t.value"
                @click="setExpenseType(t.value)"
              >{{ t.label }}</button>
            </div>
            <p v-if="typeHint" class="field-help">{{ typeHint }}</p>
          </div>

          <template v-if="form.isInstallment">
            <div class="field-row">
              <div class="field">
                <label class="field-label">Total price</label>
                <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.installmentTotalAmount }">
                  <span class="money-lkr">LKR</span>
                  <MoneyInput v-model="form.installmentTotalAmount" placeholder="0" :error="false" @update:model-value="clearError('installmentTotalAmount')" />
                </div>
                <p v-if="fieldErrors.installmentTotalAmount" class="field-error-msg">{{ fieldErrors.installmentTotalAmount }}</p>
              </div>
              <div class="field">
                <label class="field-label">Each month</label>
                <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.installmentAmount }">
                  <span class="money-lkr">LKR</span>
                  <MoneyInput v-model="form.installmentAmount" placeholder="0" :error="false" @update:model-value="clearError('installmentAmount')" />
                </div>
                <p v-if="fieldErrors.installmentAmount" class="field-error-msg">{{ fieldErrors.installmentAmount }}</p>
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label class="field-label" for="add-inst-total">Installments</label>
                <input id="add-inst-total" :value="form.installmentTotal" class="field-input num" readonly />
              </div>
              <div class="field">
                <label class="field-label" for="add-inst-paid">Paid so far</label>
                <input id="add-inst-paid" v-model.number="form.installmentCurrent" type="number" inputmode="numeric" class="field-input num" min="0" />
              </div>
            </div>
            <p v-if="form.installmentTotalAmount && form.installmentAmount" class="field-help num xform__inst-hint">
              Next on {{ instNextPaymentLabel }}, last on {{ instEndDateLabel }}, {{ instRemainingMonths }} left
            </p>
          </template>

          <div v-if="showSplitToggle" class="switch-row">
            <span class="switch-row__text">
              <span class="switch-row__title">Split the bill</span>
              <span class="switch-row__desc">Their share is recorded as money they owe you</span>
            </span>
            <button
              type="button"
              role="switch"
              class="switch"
              :aria-checked="form.isSplit"
              aria-label="Split the bill"
              @click="form.isSplit = !form.isSplit"
            />
          </div>

          <BillSplitSection
            v-if="form.isSplit"
            :total-amount="form.amount || 0"
            :person="splitPerson"
            @update:person="splitPerson = $event"
            @update:your-share="splitYourShare = $event"
            @update:their-share="splitTheirShare = $event"
          />

          <div class="field">
            <label class="field-label" for="add-notes">Note</label>
            <textarea id="add-notes" v-model="form.notes" class="field-input" rows="2" placeholder="Optional"></textarea>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn--primary btn--block xform__save">Save expense</button>
    </form>
    </template>
  </BottomSheet>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { format, addMonths, subMonths, parseISO, startOfDay, differenceInCalendarMonths, isAfter, isEqual } from 'date-fns'
import { getBudgetMonth, formatMoney } from '../../utils/format'
import { showToast } from '../../utils/toast'
import { useCloudSync } from '../../composables/useCloudSync'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import AccountPicker from '../accounts/AccountPicker.vue'
import IncomeFields from '../accounts/IncomeFields.vue'
import TransferFields from '../accounts/TransferFields.vue'
import BillSplitSection from './BillSplitSection.vue'
import QuickTemplates from './QuickTemplates.vue'
import { useSmsInbox } from '../../composables/useSmsInbox'
import { useMoneyRecords, blankIncome, blankMove } from '../../composables/useMoneyRecords'
import { useFinanceStore } from '../../stores/financeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAccountsStore } from '../../stores/accountsStore'
import { defaultCategories, getCategoryIcon, categoryLabel } from '../../utils/categoryConfig'
import { money } from '../../utils/wallets'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  prefill: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'save'])
const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()
const accounts = useAccountsStore()
const { syncNow } = useCloudSync()
const { saveIncome, saveMove } = useMoneyRecords()
const customCategories = computed(() => settingsStore.customCategories)

const mode = ref('expense')
const incomeForm = reactive(blankIncome(accounts))
const moveForm = reactive(blankMove(accounts))
const otherErrors = ref({})

const sheetTitle = computed(() => {
  if (mode.value === 'income') return incomeForm.kind === 'salary' ? 'Salary arrived' : 'Money in'
  if (mode.value === 'move') return 'Move money'
  return 'Add expense'
})

watch(mode, () => { otherErrors.value = {} })

function saveIncomeMode() {
  const res = saveIncome(incomeForm)
  if (!res.success) { otherErrors.value = res.errors || {}; return }
  const a = accounts.getAccount(incomeForm.account.replace(/^acct:/, ''))
  showToast(`${money(incomeForm.amount, a?.currency)} added to ${a?.name || 'the account'}`, 'paid')
  syncNow()
  emit('update:modelValue', false)
}

async function saveMoveMode() {
  const res = await saveMove(moveForm)
  if (res?.success === false) {
    otherErrors.value = Array.isArray(res.errors) ? { form: res.errors[0] } : (res.errors || { form: 'Could not save that' })
    return
  }
  showToast('Move saved', 'paid')
  syncNow()
  emit('update:modelValue', false)
}

const { fresh: smsFresh } = useSmsInbox()
const smsCount = computed(() => smsFresh.value.length)

function applyTemplate(t) {
  form.name = t.name
  form.category = t.category || ''
  if (t.icon) form.icon = t.icon
  if (t.iconColor) form.iconColor = t.iconColor
}

const today = format(new Date(), 'yyyy-MM-dd')

const form = reactive({
  name: '',
  amount: null,
  category: '',
  dueDate: today,
  isPaid: false,
  isRecurring: false,
  isInstallment: false,
  isScheduled: false,
  installmentCurrent: 1,
  installmentTotal: 6,
  installmentTotalAmount: null,
  installmentAmount: null,
  lentTo: '',
  hasCollectionReminder: false,
  collectionDate: '',
  fuelLiters: null,
  fuelPricePerLiter: null,
  fuelOdometer: null,
  notes: '',
  isSplit: false,
  accountId: null,
  via: null,
  paidFromCash: false,
  paidByCardId: null
})

const splitPerson = ref('')
const splitYourShare = ref(0)
const splitTheirShare = ref(0)

const source = computed({
  get: () => accounts.sourceOf(form),
  set: value => {
    Object.assign(form, accounts.applySource(value))
    const a = accounts.getAccount(form.accountId)
    if (a?.currency === 'USD' && !isFuel.value) expCurrency.value = 'USD'
  }
})

const showSourcePicker = computed(() => {
  if (isCashWithdrawal.value) return false
  if (accounts.tracking) return true
  return form.isPaid || isFuel.value || isLend.value
})

const sourceLabel = computed(() => {
  if (isLend.value) return 'Lent from'
  const paidNow = (form.isPaid && showPaidToggle.value) || isFuel.value
  return paidNow ? 'Paid from' : 'Pay from'
})

const showAllCategories = ref(false)
const moreOpen = ref(false)
const expenseType = ref('one-time')
const paidTouched = ref(false)
const paidByDate = () => { if (!paidTouched.value) form.isPaid = !form.dueDate || form.dueDate <= format(new Date(), 'yyyy-MM-dd') }
watch(() => form.dueDate, paidByDate)

// USD/LKR toggle for amount
const expCurrency = ref('LKR')
const expInputAmount = ref(null)
const expFxRate = computed(() => settingsStore.fxRate?.usdToLkr || 310)
const expConvertedLKR = computed(() =>
  expCurrency.value === 'USD' ? Math.round((expInputAmount.value || 0) * expFxRate.value) : (expInputAmount.value || 0)
)

function onExpAmountChange() {
  clearError('amount')
  form.amount = expCurrency.value === 'USD' ? expConvertedLKR.value : expInputAmount.value
}

const fieldErrors = reactive({})

function clearError(field) { delete fieldErrors[field] }

function validateForm() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])

  if (isLend.value) {
    if (!form.name?.trim()) fieldErrors.name = 'Who are you lending to?'
    if (!form.amount || form.amount <= 0) fieldErrors.amount = 'Amount is required'
  } else {
    if (!form.name?.trim()) fieldErrors.name = 'Name is required'
    if (!form.category?.trim()) fieldErrors.category = 'Category is required'

    if (form.isInstallment) {
      if (!form.installmentTotalAmount || form.installmentTotalAmount <= 0) fieldErrors.installmentTotalAmount = 'Total amount is required'
      if (!form.installmentAmount || form.installmentAmount <= 0) fieldErrors.installmentAmount = 'Monthly EMI is required'
    } else {
      if (!form.amount || form.amount <= 0) fieldErrors.amount = 'Amount is required'
    }

    if (!form.dueDate) fieldErrors.dueDate = 'Date is required'

    if (isFuel.value) {
      if (!form.fuelPricePerLiter || form.fuelPricePerLiter <= 0) fieldErrors.fuelPricePerLiter = 'Price/liter is required'
    }
  }

  return Object.keys(fieldErrors).length === 0
}

// Clear field errors and apply prefill when the sheet opens
watch(() => props.modelValue, (open) => {
  if (open) {
    Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
    expCurrency.value = 'LKR'
    expInputAmount.value = null
    showAllCategories.value = false
    moreOpen.value = false
    expenseType.value = 'one-time'
    splitPerson.value = ''
    splitYourShare.value = 0
    splitTheirShare.value = 0
    otherErrors.value = {}
    const p = props.prefill || {}
    mode.value = accounts.tracking && ['income', 'move'].includes(p.mode) ? p.mode : 'expense'
    Object.assign(incomeForm, blankIncome(accounts, p.kind || 'other'))
    if (p.account) incomeForm.account = p.account
    if (mode.value === 'income' && p.amount) incomeForm.amount = p.amount
    Object.assign(moveForm, blankMove(accounts, p.preset || 'exchange'))
    if (p.from) moveForm.from = p.from
    if (p.to) moveForm.to = p.to
    if (accounts.tracking) Object.assign(form, accounts.applySource(p.source || accounts.defaultSource()))
    if (props.prefill) {
      form.name = props.prefill.name || ''
      form.category = props.prefill.category || ''
      if (props.prefill.icon) form.icon = props.prefill.icon
      if (props.prefill.iconColor) form.iconColor = props.prefill.iconColor
      if (mode.value === 'expense' && p.amount) {
        expInputAmount.value = p.amount
        form.amount = p.amount
      }
    }
    const a = accounts.getAccount(form.accountId)
    if (a?.currency === 'USD') expCurrency.value = 'USD'
    paidTouched.value = false
    paidByDate()
  }
})

const allCategories = computed(() => {
  const custom = settingsStore.customCategories.map(c => c.name || c)
  const list = [...new Set([...defaultCategories, ...custom])]
  return accounts.tracking ? list.filter(c => c !== 'cashWithdrawal') : list
})

// Cached frequency maps — only recalculate when expenses change, not on keystroke
const categoryFreq = computed(() => {
  const freq = {}
  financeStore.expenses.forEach(e => {
    if (e.category) freq[e.category] = (freq[e.category] || 0) + 1
  })
  return freq
})

const nameFreq = computed(() => {
  const freq = {}
  financeStore.expenses.forEach(e => {
    if (e.name) freq[e.name] = (freq[e.name] || 0) + 1
  })
  return freq
})

// ── Category Grid ──
const visibleCategories = computed(() => {
  // 4 columns × 2 rows = 8 slots, minus 1 for "More" button = 7 category slots
  const freq = categoryFreq.value
  const sorted = [...allCategories.value].sort((a, b) => (freq[b] || 0) - (freq[a] || 0))
  const result = sorted.slice(0, 7)
  // Always include currently selected category so user can see their choice
  if (form.category && !result.includes(form.category)) {
    if (allCategories.value.includes(form.category)) {
      // Replace lowest-frequency item (last in sorted list)
      result[result.length - 1] = form.category
    }
  }
  return result
})

const hiddenCategories = computed(() =>
  allCategories.value.filter(c => !visibleCategories.value.includes(c))
)

function selectCategory(cat) {
  form.category = cat
  clearError('category')
}

// Keep existing suggestion computed for name field
const nameSuggestions = computed(() => {
  const raw = settingsStore.savedExpenseNames || []
  if (!raw.length) return []
  const allNames = raw.map(item => typeof item === 'string' ? item : item?.name).filter(Boolean)
  let sorted = [...new Set(allNames)].sort((a, b) => (nameFreq.value[b] || 0) - (nameFreq.value[a] || 0))
  const q = form.name?.trim()?.toLowerCase()
  if (q) {
    const prefix = sorted.filter(n => n.toLowerCase().startsWith(q))
    const contains = sorted.filter(n => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q))
    sorted = [...prefix, ...contains]
  }
  return sorted.slice(0, 8)
})

const isLend = computed(() => form.category === 'lend')
const isFuel = computed(() => form.category === 'fuel')
const isCashWithdrawal = computed(() => form.category === 'cashWithdrawal')
const dateMin = computed(() => form.isScheduled ? today : '')

const amountLabel = computed(() => {
  if (isFuel.value) return 'Total paid'
  if (isLend.value) return 'Amount lent'
  return 'Amount'
})

const dateLabel = computed(() => {
  if (isLend.value) return 'Lent on'
  if (form.isRecurring) return 'First payment'
  if (form.isInstallment) return 'First installment'
  if (form.isScheduled) return 'Due date'
  return 'Date'
})

// ── Type Selector ──
const showTypeSelector = computed(() => {
  if (isLend.value || isFuel.value || isCashWithdrawal.value) return false
  if (form.category === 'savings') return false
  return true
})

const typeOptions = [
  { value: 'one-time', label: 'Once' },
  { value: 'recurring', label: 'Monthly' },
  { value: 'installment', label: 'Installments' },
  { value: 'scheduled', label: 'Later' }
]

const typeHint = computed(() => {
  if (expenseType.value === 'recurring') return 'Repeats every month until you stop it.'
  if (expenseType.value === 'installment') return 'A purchase paid in monthly parts, such as a phone on EMI, Koko or Mint.'
  if (expenseType.value === 'scheduled') return 'A one-off payment due on a future date. It shows in Bills.'
  return ''
})

function setExpenseType(type) {
  expenseType.value = type
  form.isRecurring = type === 'recurring'
  form.isInstallment = type === 'installment'
  form.isScheduled = type === 'scheduled'
  if (type === 'scheduled') form.isPaid = false
  if (type === 'installment' && form.amount && !form.installmentTotalAmount) {
    form.installmentTotalAmount = form.amount
  }
}

// Reverse sync: when category watcher sets flags, update expenseType
watch([() => form.isRecurring, () => form.isInstallment, () => form.isScheduled], () => {
  if (form.isRecurring) expenseType.value = 'recurring'
  else if (form.isInstallment) expenseType.value = 'installment'
  else if (form.isScheduled) expenseType.value = 'scheduled'
  else expenseType.value = 'one-time'
})

// ── Quick Options ──
const showPaidToggle = computed(() => {
  if (isLend.value || isFuel.value || isCashWithdrawal.value) return false
  if (form.isScheduled || form.isRecurring || form.isInstallment) return false
  if (form.category === 'savings') return false
  return true
})

const showSplitToggle = computed(() => {
  if (isLend.value || isFuel.value || isCashWithdrawal.value) return false
  if (form.isRecurring || form.isInstallment || form.isScheduled) return false
  if (form.category === 'savings') return false
  return true
})

// The rarer options sit behind one disclosure that opens itself when in use.
const usesMoreOptions = computed(() =>
  form.isRecurring || form.isInstallment || form.isScheduled || form.isSplit || !!form.notes
)
const showMore = computed(() => moreOpen.value || usesMoreOptions.value)

const moreSummary = computed(() => {
  const parts = []
  if (form.isRecurring) parts.push('Repeats monthly')
  if (form.isInstallment) parts.push('Installments')
  if (form.isScheduled) parts.push('Due later')
  if (form.isSplit) parts.push('Split')
  if (form.notes) parts.push('Note')
  return parts.join(', ') || 'Repeat, installments, split, note'
})

// Auto-calc fuel amount from liters × price
// Derive liters from total paid / price-per-liter
watch([() => form.amount, () => form.fuelPricePerLiter], ([amount, price]) => {
  if (isFuel.value && amount && price && price > 0) {
    form.fuelLiters = Math.round((amount / price) * 100) / 100
  }
})

const computedLiters = computed(() => {
  if (form.amount && form.fuelPricePerLiter && form.fuelPricePerLiter > 0) {
    return (form.amount / form.fuelPricePerLiter).toFixed(2)
  }
  return form.fuelLiters ? Number(form.fuelLiters).toFixed(2) : '0.00'
})

// Auto-calc total installments from total amount / monthly EMI
watch([() => form.installmentTotalAmount, () => form.installmentAmount], ([total, monthly]) => {
  if (total && monthly && monthly > 0) {
    form.installmentTotal = Math.ceil(total / monthly)
  }
})

// Bidirectional installmentCurrent ↔ dueDate sync (same pattern as loans)
let instChangeSource = null

watch(() => form.installmentCurrent, (newVal, oldVal) => {
  if (instChangeSource || !form.isInstallment) return

  // Clamp
  if (newVal < 0) { form.installmentCurrent = 0; return }
  if (form.installmentTotal && newVal > form.installmentTotal) { form.installmentCurrent = form.installmentTotal; return }
  if (!form.dueDate) return

  const delta = newVal - (oldVal ?? 1)
  if (delta === 0) return

  instChangeSource = 'current'
  const currentDate = parseISO(form.dueDate)
  const adjusted = subMonths(currentDate, delta)
  form.dueDate = format(adjusted, 'yyyy-MM-dd')
  nextTick(() => { instChangeSource = null })
})

watch(() => form.dueDate, (newDate) => {
  if (instChangeSource || !form.isInstallment) return
  if (!newDate) return

  const selected = startOfDay(parseISO(newDate))
  const todayDate = startOfDay(new Date())

  instChangeSource = 'date'
  if (isAfter(selected, todayDate)) {
    form.installmentCurrent = 0
  } else if (isEqual(selected, todayDate)) {
    form.installmentCurrent = 1
  } else {
    const paymentDay = selected.getDate()
    const calMonths = differenceInCalendarMonths(todayDate, selected)
    const todayDay = new Date().getDate()
    const thisMonthPaid = todayDay >= paymentDay ? 1 : 0
    form.installmentCurrent = Math.max(1, calMonths + thisMonthPaid)
  }
  nextTick(() => { instChangeSource = null })
})

// Computed labels for installment hint
const instRemainingMonths = computed(() => {
  if (!form.installmentTotal) return 0
  return Math.max(0, form.installmentTotal - form.installmentCurrent)
})

const instNextPaymentLabel = computed(() => {
  if (!form.dueDate || !form.installmentTotal) return ''
  const firstPayment = parseISO(form.dueDate)
  const next = addMonths(firstPayment, form.installmentCurrent)
  return format(next, 'd MMM yyyy')
})

const instEndDateLabel = computed(() => {
  if (!form.dueDate || !form.installmentTotal) return ''
  const firstPayment = parseISO(form.dueDate)
  const end = addMonths(firstPayment, form.installmentTotal - 1)
  return format(end, 'd MMM yyyy')
})

// Auto-detect category type and set toggles
watch(() => form.category, (cat) => {
  if (cat === 'cashWithdrawal' || (cat === 'lend' && form.paidByCardId)) {
    form.paidFromCash = false
    form.paidByCardId = null
    form.via = null
    if (form.accountId && accounts.getAccount(form.accountId)?.wallet === 'cash') form.accountId = null
  }

  const recurringCats = ['bills', 'subscriptions']
  const installmentCats = ['installments']
  const scheduledCats = ['scheduled']

  // Check custom categories
  const customCat = settingsStore.customCategories.find(c => c.name === cat)

  if (recurringCats.includes(cat) || customCat?.type === 'recurring') {
    form.isRecurring = true
    form.isInstallment = false
    form.isScheduled = false
  } else if (installmentCats.includes(cat) || customCat?.type === 'installment') {
    form.isInstallment = true
    form.isRecurring = false
    form.isScheduled = false
    if (form.amount && !form.installmentTotalAmount) {
      form.installmentTotalAmount = form.amount
    }
  } else if (scheduledCats.includes(cat)) {
    form.isScheduled = true
    form.isRecurring = false
    form.isInstallment = false
  } else if (cat === 'cashWithdrawal') {
    form.isRecurring = false
    form.isInstallment = false
    form.isScheduled = false
    form.isPaid = true
  } else if (cat === 'lend') {
    form.isRecurring = false
    form.isInstallment = false
    form.isScheduled = false
    form.isPaid = true
    form.lentTo = form.name
  } else {
    form.isRecurring = false
    form.isInstallment = false
    form.isScheduled = false
  }
})

function handleSave() {
  if (!validateForm()) return

  const catKey = form.category.trim()
  const catInfo = getCategoryIcon(catKey, settingsStore.customCategories)

  const paidNow = form.isPaid && showPaidToggle.value
  const status = (paidNow || isFuel.value || isLend.value || isCashWithdrawal.value) ? 'paid' : 'pending'

  const expense = {
    name: form.name,
    amount: form.amount,
    category: catKey,
    dueDate: form.dueDate,
    status,
    isRecurring: form.isRecurring,
    isInstallment: form.isInstallment,
    isScheduled: form.isScheduled,
    icon: catInfo.icon,
    iconColor: catInfo.color,
    lentTo: isLend.value ? form.name : (form.lentTo || undefined),
    hasCollectionReminder: form.hasCollectionReminder || undefined,
    collectionDate: form.collectionDate || undefined,
    fuelLiters: isFuel.value ? form.fuelLiters : undefined,
    fuelPricePerLiter: isFuel.value ? form.fuelPricePerLiter : undefined,
    fuelOdometer: isFuel.value ? form.fuelOdometer : undefined,
    notes: form.notes?.trim() || undefined,
    accountId: form.accountId || undefined,
    via: form.via || undefined,
    usdAmount: !isFuel.value && expCurrency.value === 'USD' && expInputAmount.value > 0 ? expInputAmount.value : undefined,
    paidFromCash: form.paidFromCash || undefined,
    paidByCardId: isLend.value ? undefined : (form.paidByCardId || undefined)
  }
  if (accounts.tracking) accounts.rememberSource(accounts.sourceOf(form))

  if (form.isRecurring) {
    const dayOfMonth = form.dueDate ? parseISO(form.dueDate).getDate() : new Date().getDate()
    const budgetMonth = form.dueDate ? getBudgetMonth(form.dueDate) : financeStore.currentMonth
    const scheduleResult = financeStore.addSchedule({
      name: expense.name,
      amount: expense.amount,
      category: expense.category,
      dayOfMonth,
      icon: expense.icon,
      iconColor: expense.iconColor,
      startMonth: budgetMonth,
      accountId: expense.accountId,
      paidByCardId: expense.paidByCardId,
      paidFromCash: expense.paidFromCash,
      via: expense.via
    })

    if (scheduleResult.success) {
      financeStore.addExpense({
        ...expense,
        monthYear: budgetMonth,
        scheduleId: scheduleResult.id,
        isRecurring: true
      })
    }
  } else if (form.isInstallment) {
    const firstPaymentDate = parseISO(form.dueDate)
    const emiAmount = form.installmentAmount || form.amount
    const paid = form.installmentCurrent || 0
    const groupId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5)

    const now = new Date()
    for (let i = 0; i < form.installmentTotal; i++) {
      const instDate = addMonths(firstPaymentDate, i)
      const dueStr = format(instDate, 'yyyy-MM-dd')
      const datePassed = instDate <= now
      const isPaidEntry = i < paid && datePassed

      financeStore.addExpense({
        ...expense,
        amount: emiAmount,
        monthYear: getBudgetMonth(dueStr),
        dueDate: dueStr,
        status: isPaidEntry ? 'paid' : (datePassed && i < paid ? 'paid' : 'pending'),
        installmentCurrent: i + 1,
        installmentTotal: form.installmentTotal,
        installmentGroupId: groupId
      })
    }
  } else {
    if (form.isSplit && splitPerson.value && splitTheirShare.value > 0) {
      const splitGroupId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
      financeStore.addExpense({
        ...expense,
        amount: splitYourShare.value,
        splitWith: splitPerson.value,
        splitAmount: form.amount,
        splitGroupId
      })
      financeStore.addExpense({
        name: splitPerson.value,
        amount: splitTheirShare.value,
        category: 'lend',
        dueDate: form.dueDate,
        status: 'paid',
        isRecurring: false,
        isInstallment: false,
        isScheduled: false,
        icon: 'handshake',
        iconColor: '#C0C1FF',
        lentTo: splitPerson.value,
        notes: `Split: ${form.name} (LKR ${form.amount})`,
        accountId: expense.accountId,
        via: expense.via,
        paidFromCash: expense.paidFromCash,
        paidByCardId: expense.paidByCardId,
        splitGroupId
      })
      if (!settingsStore.savedSplitPeople?.includes(splitPerson.value)) {
        if (!settingsStore.savedSplitPeople) settingsStore.savedSplitPeople = []
        settingsStore.savedSplitPeople.push(splitPerson.value)
      }
    } else {
      financeStore.addExpense(expense)
    }
  }

  settingsStore.addSavedExpenseName(form.name.trim())

  let message = 'Expense added'
  if (isCashWithdrawal.value) message = 'Cash withdrawal recorded'
  else if (paidNow) message = 'Paid expense recorded'
  else if (form.isScheduled) message = 'Payment scheduled'
  else if (form.isRecurring) message = 'Monthly expense added'
  else if (form.isInstallment) message = `Installment plan added, ${form.installmentTotal} months`

  showToast(message)
  syncNow()

  emit('save', expense)
  emit('update:modelValue', false)

  Object.assign(form, {
    name: '',
    amount: null,
    category: '',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    isPaid: false,
    isRecurring: false,
    isInstallment: false,
    isScheduled: false,
    installmentCurrent: 1,
    installmentTotal: 6,
    installmentTotalAmount: null,
    installmentAmount: null,
    lentTo: '',
    hasCollectionReminder: false,
    collectionDate: '',
    fuelLiters: null,
    fuelPricePerLiter: null,
    fuelOdometer: null,
    notes: '',
    isSplit: false,
    accountId: null,
    via: null,
    paidFromCash: false,
    paidByCardId: null
  })
  splitPerson.value = ''
  splitYourShare.value = 0
  splitTheirShare.value = 0
}
</script>

<style lang="scss" scoped>
.switch-row__title, .switch-row__desc { display: block; }

.sms-entry {
  margin: 0 0 12px;
  padding-left: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--raised);
}

.sheet-templates { margin-bottom: 16px; }
.add-modes { margin-bottom: 16px; }

.xform__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  .field-label { margin-bottom: 0; }
  .seg button { height: 28px; padding: 0 10px; }
}

.xform__amount {
  height: 56px;
  .money-lkr { font-size: var(--fs-section); }
  :deep(.money-input) { font-size: 28px; font-weight: 600; }
}

.xform__suggest { margin-top: 8px; }
.xform__wrap { flex-wrap: wrap; overflow: visible; }
.xform__chip-more { color: var(--muted); }
.xform__custom-cat { margin-top: 8px; }

.xform__readout {
  height: var(--control-height);
  display: flex;
  align-items: center;
  font-size: 16px;
  color: var(--muted);
}

.xform__more {
  margin: 8px 0 0;
  border-top: 1px solid var(--rule);
}

.xform__more-toggle {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  color: var(--text);
  .material-symbols-outlined { color: var(--muted); }
}

.xform__more-title { display: block; font-weight: 500; }
.xform__more-head { padding: 16px 0 12px; }
.xform__more-sub { display: block; font-size: var(--fs-small); color: var(--muted); line-height: 16px; margin-top: 2px; }
.xform__more-body { padding-top: 4px; }
.xform__inst-hint { margin: -4px 0 16px; }
.xform__save { margin-top: 8px; }
</style>
