<template>
  <BottomSheet
    :model-value="modelValue"
    title="Add a loan"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form @submit.prevent="handleSave">
      <p class="field-help loan-context">For money borrowed from a bank or a person. Store installments like Koko or Mint go in as an expense instead.</p>

      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="form.name" class="field-input" :class="{ 'field-error': fieldErrors.name }" placeholder="Vehicle loan" @input="clearError('name')" />
        <span v-if="fieldErrors.name" class="field-error-msg">{{ fieldErrors.name }}</span>
      </label>

      <div class="field">
        <label class="field-label" for="loan-lender">Lender</label>
        <div class="input-with-clear">
          <input id="loan-lender" v-model="form.lender" class="field-input" placeholder="Commercial Bank" />
          <button v-if="form.lender" type="button" class="field-clear" aria-label="Clear lender" @click="form.lender = ''">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div v-if="lenderSuggestions.length" :key="'lender-' + form.lender" class="chips loan-chips">
          <button v-for="sug in lenderSuggestions" :key="sug" type="button" class="chip" @click="form.lender = sug">{{ sug }}</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="loan-type">Type</label>
        <div class="input-with-clear">
          <input id="loan-type" v-model="form.type" class="field-input" placeholder="Personal, vehicle, mortgage" />
          <button v-if="form.type" type="button" class="field-clear" aria-label="Clear type" @click="form.type = ''">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div v-if="typeSuggestions.length" :key="'type-' + form.type" class="chips loan-chips">
          <button v-for="sug in typeSuggestions" :key="sug" type="button" class="chip" @click="form.type = sug">{{ sug }}</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="loan-total">Amount borrowed</label>
        <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.totalAmount }">
          <span class="money-lkr">LKR</span>
          <MoneyInput id="loan-total" v-model="form.totalAmount" class="field-input num" placeholder="300,000" :error="false" @update:modelValue="clearError('totalAmount')" />
        </div>
        <span v-if="fieldErrors.totalAmount" class="field-error-msg">{{ fieldErrors.totalAmount }}</span>
      </div>

      <div class="field">
        <span class="field-label">Repaid</span>
        <div class="seg seg--block" role="group" aria-label="Repaid">
          <button type="button" :aria-pressed="!form.isOneTime" @click="form.isOneTime = false">Monthly EMI</button>
          <button type="button" :aria-pressed="form.isOneTime" @click="form.isOneTime = true">In one payment</button>
        </div>
      </div>

      <template v-if="!form.isOneTime">
        <div class="field">
          <label class="field-label" for="loan-emi">Monthly EMI</label>
          <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.monthlyInstallment }">
            <span class="money-lkr">LKR</span>
            <MoneyInput id="loan-emi" v-model="form.monthlyInstallment" class="field-input num" placeholder="12,500" :error="false" @update:modelValue="clearError('monthlyInstallment')" />
          </div>
          <span v-if="fieldErrors.monthlyInstallment" class="field-error-msg">{{ fieldErrors.monthlyInstallment }}</span>
        </div>
        <div class="field-row">
          <label class="field">
            <span class="field-label">Months in total</span>
            <input v-model.number="form.totalMonths" class="field-input num" :class="{ 'field-error': fieldErrors.totalMonths }" type="number" min="1" @input="clearError('totalMonths')" />
            <span v-if="fieldErrors.totalMonths" class="field-error-msg">{{ fieldErrors.totalMonths }}</span>
          </label>
          <label class="field">
            <span class="field-label">Already paid</span>
            <input v-model.number="form.monthsPaid" class="field-input num" type="number" min="0" />
          </label>
        </div>
      </template>

      <label class="field">
        <span class="field-label">Received on</span>
        <input v-model="form.receivedDate" type="date" class="field-input num" />
      </label>

      <div v-if="accounts.tracking" class="field">
        <p class="field-label">Money landed in</p>
        <AccountPicker v-model="form.landedIn" :cards="false" :paypal="false" label="Money landed in" />
        <p class="field-help">Leave it empty if the lender paid the seller directly.</p>
      </div>

      <label class="field">
        <span class="field-label">{{ form.isOneTime ? 'Pay back on' : 'First EMI on' }}</span>
        <input v-model="form.dueDate" type="date" class="field-input num" />
      </label>

      <p v-if="form.isOneTime && form.totalAmount" class="field-help loan-summary num">
        All LKR {{ formatMoney(form.totalAmount) }} is due on that date.
      </p>
      <p v-if="!form.isOneTime && form.totalMonths && form.dueDate" class="field-help loan-summary num">
        Next EMI {{ nextPaymentLabel }}, last {{ endDateLabel }}, {{ remainingMonths }} to go.
      </p>

      <div v-if="form.monthsPaid > 0 && !form.isOneTime" class="switch-row">
        <span class="switch-row__text">
          <span class="switch-row__title">Add the paid months as expenses</span>
          <span class="switch-row__desc num">Creates {{ form.monthsPaid }} paid {{ form.monthsPaid === 1 ? 'entry' : 'entries' }} in earlier months.</span>
        </span>
        <button
          type="button"
          class="switch"
          role="switch"
          :aria-checked="form.addPastExpenses"
          aria-label="Add the paid months as expenses"
          @click="form.addPastExpenses = !form.addPastExpenses"
        />
      </div>

      <button type="submit" class="btn btn--primary btn--block">Save loan</button>
    </form>
  </BottomSheet>
</template>

<script setup>
import { reactive, computed, watch, nextTick } from 'vue'
import { format, subMonths, addMonths, differenceInCalendarMonths, startOfDay, isAfter, isEqual, parseISO } from 'date-fns'
import { getBudgetMonth, formatMoney } from '../../utils/format'
import { showToast } from '../../utils/toast'
import { useCloudSync } from '../../composables/useCloudSync'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { useFinanceStore } from '../../stores/financeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAccountsStore } from '../../stores/accountsStore'
import AccountPicker from '../accounts/AccountPicker.vue'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()
const accounts = useAccountsStore()
const { syncNow } = useCloudSync()

const today = format(new Date(), 'yyyy-MM-dd')

const form = reactive({
  name: '', lender: '', type: '',
  totalAmount: null, monthlyInstallment: null,
  totalMonths: null, monthsPaid: 0,
  receivedDate: today, dueDate: today,
  addPastExpenses: true, isOneTime: false,
  landedIn: ''
})

const fieldErrors = reactive({})
function clearError(field) { delete fieldErrors[field] }

// Clear errors when sheet opens
watch(() => props.modelValue, (open) => {
  if (open) Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
})

function validateForm() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!form.name?.trim()) fieldErrors.name = 'Loan name is required'
  if (!form.totalAmount || form.totalAmount <= 0) fieldErrors.totalAmount = 'Amount is required'
  if (!form.isOneTime) {
    if (!form.monthlyInstallment || form.monthlyInstallment <= 0) fieldErrors.monthlyInstallment = 'EMI is required'
    if (!form.totalMonths || form.totalMonths <= 0) fieldErrors.totalMonths = 'Total months is required'
    if (form.totalMonths > 360) fieldErrors.totalMonths = 'Max 360 months (30 years)'
  }
  return Object.keys(fieldErrors).length === 0
}

watch([() => form.totalAmount, () => form.monthlyInstallment], ([total, emi]) => {
  if (total && emi && emi > 0) form.totalMonths = Math.min(360, Math.ceil(total / emi))
})

watch(() => form.isOneTime, (val) => {
  if (val) { form.monthlyInstallment = form.totalAmount || 0; form.totalMonths = 1; form.monthsPaid = 0 }
})

watch(() => form.totalAmount, (total) => {
  if (form.isOneTime && total) { form.monthlyInstallment = total; form.totalMonths = 1 }
})

let changeSource = null

watch(() => form.monthsPaid, (newVal, oldVal) => {
  if (changeSource === 'date') return
  if (newVal < 0) { form.monthsPaid = 0; return }
  if (form.totalMonths && newVal > form.totalMonths) { form.monthsPaid = form.totalMonths; return }
  if (!form.dueDate) return
  const delta = newVal - (oldVal ?? 0)
  if (delta === 0) return
  changeSource = 'monthsPaid'
  const currentDate = parseISO(form.dueDate)
  const adjusted = subMonths(currentDate, delta)
  form.dueDate = format(adjusted, 'yyyy-MM-dd')
  nextTick(() => { changeSource = null })
})

watch(() => form.dueDate, (newDate) => {
  if (changeSource === 'monthsPaid') return
  if (!newDate) return
  const selected = startOfDay(parseISO(newDate))
  const todayDate = startOfDay(new Date())
  changeSource = 'date'
  if (isAfter(selected, todayDate)) { form.monthsPaid = 0 }
  else if (isEqual(selected, todayDate)) { form.monthsPaid = 1 }
  else {
    const paymentDay = selected.getDate()
    const calMonths = differenceInCalendarMonths(todayDate, selected)
    const todayDay = new Date().getDate()
    const thisMonthPaid = todayDay >= paymentDay ? 1 : 0
    form.monthsPaid = Math.max(1, calMonths + thisMonthPaid)
  }
  nextTick(() => { changeSource = null })
})

const remainingMonths = computed(() => form.totalMonths ? Math.max(0, form.totalMonths - (form.monthsPaid || 0)) : 0)
const endDateLabel = computed(() => {
  if (!form.dueDate || !form.totalMonths) return ''
  return format(addMonths(new Date(form.dueDate), form.totalMonths - 1), 'MMM dd, yyyy')
})
const nextPaymentLabel = computed(() => {
  if (!form.dueDate || !form.totalMonths) return ''
  return format(addMonths(parseISO(form.dueDate), form.monthsPaid || 0), 'MMM dd, yyyy')
})

const loanTypeFreq = computed(() => {
  const freq = {}
  for (const loan of financeStore.loans || []) { const t = (loan.type || '').trim(); if (t) freq[t] = (freq[t] || 0) + 1 }
  return freq
})

const loanLenderFreq = computed(() => {
  const freq = {}
  for (const loan of financeStore.loans || []) { const l = (loan.lender || '').trim(); if (l) freq[l] = (freq[l] || 0) + 1 }
  return freq
})

const typeSuggestions = computed(() => {
  const q = form.type.trim().toLowerCase()
  const arr = (settingsStore.savedLoanTypes || []).filter(t => !q || t.toLowerCase().includes(q))
  arr.sort((a, b) => (loanTypeFreq.value[b] || 0) - (loanTypeFreq.value[a] || 0))
  if (!q) return arr.slice(0, 8)
  const prefix = arr.filter(x => x.toLowerCase().startsWith(q))
  const contains = arr.filter(x => !x.toLowerCase().startsWith(q) && x.toLowerCase().includes(q))
  return [...prefix, ...contains].slice(0, 8)
})

const lenderSuggestions = computed(() => {
  if (!(settingsStore.savedLenders || []).length) return []
  const q = form.lender.trim().toLowerCase()
  const arr = settingsStore.savedLenders.filter(l => !q || l.toLowerCase().includes(q))
  arr.sort((a, b) => (loanLenderFreq.value[b] || 0) - (loanLenderFreq.value[a] || 0))
  if (!q) return arr.slice(0, 8)
  const prefix = arr.filter(x => x.toLowerCase().startsWith(q))
  const contains = arr.filter(x => !x.toLowerCase().startsWith(q) && x.toLowerCase().includes(q))
  return [...prefix, ...contains].slice(0, 8)
})

function handleSave() {
  if (form.isOneTime) { form.monthlyInstallment = form.totalAmount; form.totalMonths = 1; form.monthsPaid = 0 }
  if (!validateForm()) return

  const typeIcons = { personal: 'account_balance', bnpl: 'shopping_bag', fintech: 'credit_card', 'credit card': 'credit_card', mortgage: 'home', vehicle: 'directions_car' }
  const loanResult = financeStore.addLoan({
    name: form.name, lender: form.lender, type: form.type,
    totalAmount: form.totalAmount, monthlyInstallment: form.monthlyInstallment,
    totalMonths: form.totalMonths, monthsPaid: form.monthsPaid,
    receivedDate: form.receivedDate, nextDueDate: form.dueDate, status: 'active',
    isOneTime: form.isOneTime, icon: typeIcons[form.type.trim().toLowerCase()] || 'account_balance'
  })
  if (!loanResult?.success) return
  const loanId = loanResult.id

  financeStore.addLoanDisbursement({
    loanId, name: form.name, amount: form.totalAmount,
    monthYear: getBudgetMonth(form.receivedDate), date: form.receivedDate,
    accountId: accounts.tracking ? (accounts.applySource(form.landedIn).accountId || undefined) : undefined
  })

  const firstPaymentDate = parseISO(form.dueDate)
  const now = new Date()
  const loanIcon = typeIcons[form.type.trim().toLowerCase()] || 'account_balance'
  const groupId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5)

  // Always create EMI rows for past months that the user marked as already
  // paid. The `addPastExpenses` toggle only controls whether they appear in
  // the user's expense ledger view — internally we still need the rows so
  // dataIntegrity Check 11 can sync `monthsPaid` from the paid-EMI count
  // without resetting it to 0 (which would corrupt the loan balance).
  for (let i = 0; i < form.totalMonths; i++) {
    const instDate = addMonths(firstPaymentDate, i)
    const dueStr = format(instDate, 'yyyy-MM-dd')
    const datePassed = instDate <= now
    const isPaid = i < form.monthsPaid && datePassed
    financeStore.addExpense({
      name: `${form.name} EMI`, amount: form.monthlyInstallment,
      category: 'loans', dueDate: dueStr, monthYear: getBudgetMonth(dueStr),
      status: isPaid ? 'paid' : 'pending', isRecurring: true, isInstallment: true,
      installmentCurrent: i + 1, installmentTotal: form.totalMonths,
      icon: loanIcon, iconColor: '#C0C1FF', installmentGroupId: groupId, loanId,
      // Hide past prepaid EMIs from the user's main expense list when they
      // opted out of "Add past expenses". The row still exists for
      // bookkeeping but is filtered out of the timeline view.
      hiddenFromList: !form.addPastExpenses && isPaid
    })
  }

  if (settingsStore.addSavedLoanType) settingsStore.addSavedLoanType(form.type.trim())
  if (settingsStore.addSavedLender) settingsStore.addSavedLender(form.lender.trim())

  showToast(`Loan added with ${form.totalMonths} installments`)
  syncNow()

  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  Object.assign(form, {
    name: '', lender: '', type: '', totalAmount: null, monthlyInstallment: null,
    totalMonths: null, monthsPaid: 0, receivedDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: format(new Date(), 'yyyy-MM-dd'), addPastExpenses: true, isOneTime: false
  })
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
.loan-context { margin: 0 0 16px; font-size: var(--fs-body); line-height: 20px; }
.loan-chips { margin-top: 8px; }
.loan-summary { margin: -4px 0 16px; }
</style>
