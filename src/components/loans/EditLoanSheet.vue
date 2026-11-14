<template>
  <BottomSheet
    :model-value="modelValue"
    title="Edit loan"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form v-if="loan" @submit.prevent="handleSave">
      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="form.name" class="field-input" :class="{ 'field-error': fieldErrors.name }" @input="clearError('name')" />
        <span v-if="fieldErrors.name" class="field-error-msg">{{ fieldErrors.name }}</span>
      </label>

      <label class="field">
        <span class="field-label">Lender</span>
        <input v-model="form.lender" class="field-input" placeholder="Commercial Bank" />
      </label>

      <div class="field">
        <label class="field-label" for="edit-loan-type">Type</label>
        <div class="input-with-clear">
          <input id="edit-loan-type" v-model="form.type" type="text" class="field-input" placeholder="Personal, vehicle" />
          <button v-if="form.type" type="button" class="field-clear" aria-label="Clear type" @click="form.type = ''">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div v-if="typeSuggestions.length" class="chips loan-chips">
          <button v-for="t in typeSuggestions" :key="t" type="button" class="chip" :class="{ on: form.type === t }" @click="form.type = t">{{ t }}</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="edit-loan-total">Amount borrowed</label>
        <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.totalAmount }">
          <span class="money-lkr">LKR</span>
          <MoneyInput id="edit-loan-total" v-model="form.totalAmount" placeholder="0" :error="false" @update:modelValue="clearError('totalAmount')" />
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
          <label class="field-label" for="edit-loan-emi">Monthly EMI</label>
          <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.monthlyInstallment }">
            <span class="money-lkr">LKR</span>
            <MoneyInput id="edit-loan-emi" v-model="form.monthlyInstallment" placeholder="0" :error="false" @update:modelValue="clearError('monthlyInstallment')" />
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

      <div v-else class="field">
        <span class="field-label">Status</span>
        <div class="seg seg--block" role="group" aria-label="Status">
          <button type="button" :aria-pressed="form.monthsPaid >= 1" @click="form.monthsPaid = 1">Paid back</button>
          <button type="button" :aria-pressed="form.monthsPaid === 0" @click="form.monthsPaid = 0">Not yet</button>
        </div>
      </div>

      <label class="field">
        <span class="field-label">Received on</span>
        <input v-model="form.receivedDate" type="date" class="field-input num" />
      </label>

      <label class="field">
        <span class="field-label">{{ form.isOneTime ? 'Pay back on' : 'First EMI on' }}</span>
        <input v-model="form.nextDueDate" type="date" class="field-input num" />
      </label>

      <p v-if="form.isOneTime && form.totalAmount" class="field-help loan-summary num">
        All LKR {{ formatMoney(form.totalAmount) }} is due on that date.
      </p>

      <button type="submit" class="btn btn--primary btn--block">Save changes</button>
    </form>
  </BottomSheet>
</template>

<script setup>
import { reactive, watch, computed, nextTick } from 'vue'
import { format, addMonths, subMonths, parseISO, startOfDay, differenceInCalendarMonths, isAfter, isEqual } from 'date-fns'
import BottomSheet from '../shared/BottomSheet.vue'
import { showToast } from '../../utils/toast'
import { formatMoney } from '../../utils/format'
import MoneyInput from '../shared/MoneyInput.vue'
import { useFinanceStore } from '../../stores/financeStore'
import { useSettingsStore } from '../../stores/settingsStore'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  loan: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])
const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()

const typeSuggestions = computed(() => settingsStore.savedLoanTypes || ['Personal', 'BNPL', 'Fintech'])

const form = reactive({
  name: '', lender: '', type: '', totalAmount: null,
  monthlyInstallment: null, totalMonths: null,
  monthsPaid: 0, nextDueDate: '', isOneTime: false, receivedDate: ''
})

const fieldErrors = reactive({})
function clearError(field) { delete fieldErrors[field] }

function validateForm() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!form.name?.trim()) fieldErrors.name = 'Name is required'
  if (!form.totalAmount || form.totalAmount <= 0) fieldErrors.totalAmount = 'Amount is required'
  if (form.monthlyInstallment && form.monthlyInstallment <= 0) fieldErrors.monthlyInstallment = 'EMI must be positive'
  if (form.totalMonths && form.totalMonths > 360) fieldErrors.totalMonths = 'Max 360 months'
  if (form.totalMonths && form.monthsPaid > form.totalMonths) {
    fieldErrors.totalMonths = `Total months cannot be less than months paid (${form.monthsPaid})`
  }
  return Object.keys(fieldErrors).length === 0
}

let changeSource = null

watch(() => props.loan, (l) => {
  if (l) {
    Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
    changeSource = 'init'
    form.name = l.name || ''; form.lender = l.lender || ''; form.type = l.type || ''
    form.totalAmount = l.totalAmount || null; form.monthlyInstallment = l.monthlyInstallment || null
    form.totalMonths = l.totalMonths || null; form.monthsPaid = l.monthsPaid || 0
    form.nextDueDate = l.nextDueDate || ''; form.isOneTime = l.isOneTime || (l.totalMonths === 1)
    form.receivedDate = l.receivedDate || l.nextDueDate || format(new Date(), 'yyyy-MM-dd')
    nextTick(() => { changeSource = null })
  }
}, { immediate: true })

watch(() => form.monthsPaid, (newVal, oldVal) => {
  if (changeSource === 'date' || changeSource === 'init') return
  if (newVal < 0) { form.monthsPaid = 0; return }
  if (form.totalMonths && newVal > form.totalMonths) { form.monthsPaid = form.totalMonths; return }
  if (!form.nextDueDate) return
  const delta = newVal - (oldVal ?? 0)
  if (delta === 0) return
  changeSource = 'monthsPaid'
  form.nextDueDate = format(subMonths(parseISO(form.nextDueDate), delta), 'yyyy-MM-dd')
  nextTick(() => { changeSource = null })
})

watch(() => form.nextDueDate, (newDate) => {
  if (changeSource === 'monthsPaid' || changeSource === 'init') return
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
    form.monthsPaid = Math.max(1, calMonths + (todayDay >= paymentDay ? 1 : 0))
  }
  nextTick(() => { changeSource = null })
})

watch(() => form.isOneTime, (val) => {
  if (val) { form.monthlyInstallment = form.totalAmount || 0; form.totalMonths = 1 }
})

watch(() => form.totalAmount, (total) => {
  if (form.isOneTime && total) { form.monthlyInstallment = total; form.totalMonths = 1 }
})

async function handleSave() {
  if (!props.loan?.id) return
  if (form.isOneTime) { form.monthlyInstallment = form.totalAmount; form.totalMonths = 1 }
  if (!validateForm()) return

  const oldMonthsPaid = props.loan.monthsPaid || 0
  const newMonthsPaid = form.monthsPaid || 0
  const oldTotalMonths = props.loan.totalMonths || 0
  const newTotalMonths = form.totalMonths || 0
  const oldMonthlyInstallment = props.loan.monthlyInstallment || 0
  const newMonthlyInstallment = form.monthlyInstallment || 0

  const result = financeStore.updateLoan(props.loan.id, { ...form, receivedDate: form.receivedDate })
  if (!result?.success) { showToast(result?.errors?.[0] || 'Update failed', 'error'); return }

  // Get all EMI expenses for this loan (sorted by installmentCurrent)
  const emiExpenses = financeStore.expenses
    .filter(e => e.loanId === props.loan.id && e.category === 'loans' && e.isInstallment)
    .sort((a, b) => (a.installmentCurrent || 0) - (b.installmentCurrent || 0))

  // If monthlyInstallment changed, update the amount on all UNPAID expenses
  if (oldMonthlyInstallment !== newMonthlyInstallment) {
    for (const e of emiExpenses) {
      if (e.status !== 'paid') {
        await financeStore.updateExpense(e.id, { amount: newMonthlyInstallment })
      }
    }
  }

  // If totalMonths decreased, delete pending installments beyond the new total
  if (newTotalMonths < oldTotalMonths) {
    for (const e of emiExpenses) {
      if ((e.installmentCurrent || 0) > newTotalMonths && e.status !== 'paid') {
        financeStore.deleteExpense(e.id)
      }
    }
  }

  // If totalMonths increased, add new pending installments
  if (newTotalMonths > oldTotalMonths && emiExpenses.length > 0) {
    const { addMonths, format, parseISO } = await import('date-fns')
    const { getBudgetMonth } = await import('../../utils/format')
    const lastExp = emiExpenses[emiExpenses.length - 1]
    const lastDueDate = parseISO(lastExp.dueDate)
    const groupId = lastExp.installmentGroupId

    for (let i = emiExpenses.length; i < newTotalMonths; i++) {
      const newDate = addMonths(lastDueDate, i - emiExpenses.length + 1)
      const dueStr = format(newDate, 'yyyy-MM-dd')
      financeStore.addExpense({
        name: `${form.name} EMI`,
        amount: newMonthlyInstallment,
        category: 'loans',
        dueDate: dueStr,
        monthYear: getBudgetMonth(dueStr),
        status: 'pending',
        isRecurring: true,
        isInstallment: true,
        installmentCurrent: i + 1,
        installmentTotal: newTotalMonths,
        icon: lastExp.icon || 'account_balance',
        iconColor: lastExp.iconColor || '#C0C1FF',
        installmentGroupId: groupId,
        loanId: props.loan.id
      })
    }

    // Update installmentTotal on all existing expenses
    for (const e of emiExpenses) {
      await financeStore.updateExpense(e.id, { installmentTotal: newTotalMonths })
    }
  }

  // Sync EMI expense status when monthsPaid changes
  if (oldMonthsPaid !== newMonthsPaid) {
    // Refresh after potential additions/deletions
    const updatedEmiExpenses = financeStore.expenses
      .filter(e => e.loanId === props.loan.id && e.category === 'loans' && e.isInstallment)
      .sort((a, b) => (a.installmentCurrent || 0) - (b.installmentCurrent || 0))

    for (let i = 0; i < updatedEmiExpenses.length; i++) {
      const e = updatedEmiExpenses[i]
      const shouldBePaid = i < newMonthsPaid
      const newStatus = shouldBePaid ? 'paid' : 'pending'
      if (e.status !== newStatus) {
        await financeStore.updateExpense(e.id, { status: newStatus })
      }
    }
  }

  // Recompute liability fields from the source of truth: paid EMI rows + standalone payoffs.
  // After all the EMI status flips above, totalRepaid via store mutation may be partially
  // out of sync (e.g. when only monthlyInstallment changed and amounts were edited on
  // unpaid rows). This brings the loan back to a clean state.
  const finalLoan = financeStore.loans.find(l => l.id === props.loan.id)
  if (finalLoan) {
    // Renumber surviving EMI rows so installmentCurrent/Total match the actual
    // row list after add/delete/status-flip (fixes "5 of 10" vs rows up to 12).
    const emiRows = financeStore.expenses
      .filter(e => e.loanId === props.loan.id && e.category === 'loans' && e.isInstallment)
      .sort((a, b) => (a.installmentCurrent || 0) - (b.installmentCurrent || 0))
    emiRows.forEach((e, i) => { e.installmentCurrent = i + 1; e.installmentTotal = emiRows.length; e.updatedAt = Date.now() })

    const paidEMIsTotal = emiRows
      .filter(e => e.status === 'paid')
      .reduce((s, e) => s + (e.amount || 0), 0)
    const paidEMICount = emiRows.filter(e => e.status === 'paid').length
    const payoffTotal = financeStore.expenses
      .filter(e => e.loanId === props.loan.id && e.category === 'loans' &&
                   !e.isInstallment && e.status === 'paid')
      .reduce((s, e) => s + (e.amount || 0), 0)
    const finalRepaid = paidEMIsTotal + payoffTotal
    const finalBalance = Math.max(0, (finalLoan.totalAmount || 0) - finalRepaid)
    financeStore.updateLoan(props.loan.id, {
      totalRepaid: finalRepaid,
      outstandingBalance: finalBalance,
      monthsPaid: paidEMICount,
      totalMonths: emiRows.length,
      status: finalBalance === 0 && finalLoan.status === 'active' ? 'completed' : finalLoan.status
    })
  }

  showToast('Loan updated', 'edit')
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
.loan-chips { margin-top: 8px; }
.loan-summary { margin: -4px 0 16px; }
</style>
