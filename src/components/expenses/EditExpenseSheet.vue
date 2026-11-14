<template>
  <BottomSheet
    :model-value="modelValue"
    title="Edit expense"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form v-if="expense" class="xform" novalidate @submit.prevent="handleSave">
      <p v-if="expense.splitGroupId" class="notice xform__notice">
        <span class="material-symbols-outlined">group</span>
        <span>
          <template v-if="splitPartnerName && splitPartnerName !== 'undefined'">Split with {{ splitPartnerName }}.</template>
          <template v-else>Part of a split.</template>
          Changes apply to this entry only.
        </span>
      </p>

      <div class="field">
        <label class="field-label" for="edit-amount">{{ isFuel ? 'Total paid' : editsInstallmentAmount ? 'Each month' : 'Amount' }}</label>
        <div class="money-wrap xform__amount" :class="{ 'money-wrap--error': !!fieldErrors.amount }">
          <span class="money-lkr">LKR</span>
          <MoneyInput
            v-if="editsInstallmentAmount"
            id="edit-amount"
            v-model="form.installmentAmount"
            placeholder="0"
            :error="false"
            @update:model-value="clearError('amount')"
          />
          <MoneyInput
            v-else
            id="edit-amount"
            v-model="form.amount"
            placeholder="0"
            :error="false"
            @update:model-value="clearError('amount')"
          />
        </div>
        <p v-if="fieldErrors.amount" class="field-error-msg">{{ fieldErrors.amount }}</p>
      </div>

      <div class="field">
        <label class="field-label" for="edit-name">Name</label>
        <input
          id="edit-name"
          v-model="form.name"
          class="field-input"
          :class="{ 'field-error': fieldErrors.name }"
          autocomplete="off"
          @input="clearError('name')"
        />
        <p v-if="fieldErrors.name" class="field-error-msg">{{ fieldErrors.name }}</p>
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
            @click="form.category = cat; clearError('category')"
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
        <label class="field-label" for="edit-date">{{ isLend ? 'Lent on' : 'Date' }}</label>
        <input id="edit-date" v-model="form.dueDate" type="date" class="field-input num" />
      </div>

      <template v-if="isFuel">
        <div class="field-row">
          <div class="field">
            <label class="field-label" for="edit-fuel-price">Price per litre</label>
            <input
              id="edit-fuel-price"
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
          <label class="field-label" for="edit-odo">Odometer, optional</label>
          <input id="edit-odo" v-model.number="form.fuelOdometer" type="number" inputmode="numeric" class="field-input num" placeholder="km" />
        </div>
      </template>

      <template v-if="isLend">
        <div class="field">
          <label class="field-label" for="edit-lent-to">Lent to</label>
          <input id="edit-lent-to" v-model="form.lentTo" type="text" class="field-input" placeholder="Name" />
        </div>
        <div class="switch-row">
          <span class="switch-row__text"><span class="switch-row__title">Remind me to collect</span></span>
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
          <label class="field-label" for="edit-collect">Remind on</label>
          <input id="edit-collect" v-model="form.collectionDate" type="date" class="field-input num" />
        </div>
      </template>

      <div class="switch-row">
        <span class="switch-row__text">
          <span class="switch-row__title">Paid</span>
          <span class="switch-row__desc" :class="{ 'is-negative': !isPaid && form.status === 'overdue' }">{{ isPaid ? 'Already paid' : form.status === 'overdue' ? 'Overdue, not paid yet' : 'Still to pay, shows in Bills' }}</span>
        </span>
        <button type="button" role="switch" class="switch" :aria-checked="isPaid" aria-label="Paid" @click="isPaid = !isPaid" />
      </div>

      <div v-if="showSourcePicker" class="field">
        <p class="field-label">{{ isLend ? 'Lent from' : (isPaid || isFuel ? 'Paid from' : 'Pay from') }}</p>
        <AccountPicker v-model="source" :cards="!isLend" />
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
            <span class="xform__more-sub">Note</span>
          </span>
          <span class="material-symbols-outlined">{{ showMore ? 'expand_less' : 'expand_more' }}</span>
        </button>
        <p v-else class="xform__more-title xform__more-head">More options</p>

        <div v-if="showMore" class="xform__more-body">
          <template v-if="recurringSchedule">
            <p class="xform__group-title">Repeats every month</p>
            <p class="field-help xform__group-help">Changes apply to every future unpaid entry.</p>
            <div class="field">
              <label class="field-label" for="edit-sched-name">Name on each entry</label>
              <input id="edit-sched-name" v-model="scheduleForm.name" class="field-input" />
            </div>
            <div class="field-row">
              <div class="field">
                <label class="field-label">Amount</label>
                <div class="money-wrap">
                  <span class="money-lkr">LKR</span>
                  <MoneyInput v-model="scheduleForm.amount" placeholder="0" :error="false" />
                </div>
              </div>
              <div class="field">
                <label class="field-label" for="edit-sched-day">Day of month</label>
                <input id="edit-sched-day" v-model.number="scheduleForm.dayOfMonth" type="number" inputmode="numeric" min="1" max="31" class="field-input num" />
              </div>
            </div>
          </template>

          <div v-if="editsInstallmentAmount" class="field-row">
            <div class="field">
              <label class="field-label" for="edit-inst-n">Payment number</label>
              <input id="edit-inst-n" v-model.number="form.installmentCurrent" type="number" inputmode="numeric" class="field-input num" min="1" />
            </div>
            <div class="field">
              <label class="field-label" for="edit-inst-total">Of</label>
              <input id="edit-inst-total" v-model.number="form.installmentTotal" type="number" class="field-input num" min="1" readonly />
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="edit-notes">Note</label>
            <textarea id="edit-notes" v-model="form.notes" class="field-input" rows="2" placeholder="Optional"></textarea>
          </div>
        </div>
      </div>

      <button type="submit" class="btn btn--primary btn--block xform__save">Save changes</button>

      <div class="xform__actions">
        <button
          v-if="expense.isInstallment && pendingInstallmentCount > 0"
          type="button"
          class="btn btn--outline btn--block"
          @click="handlePayOffRemaining"
        >Pay off the remaining {{ pendingInstallmentCount }}</button>
        <button
          v-if="isLoanEMI && form.status !== 'paid'"
          type="button"
          class="btn btn--outline btn--block"
          @click="handleSkipMonth"
        >Skip this month</button>
        <button
          v-if="expense.isRecurring && !expense.isInstallment && expense.category !== 'loans'"
          type="button"
          class="btn btn--danger btn--block"
          @click="handleStopRecurring"
        >Stop repeating</button>
        <button
          v-if="expense.isInstallment"
          type="button"
          class="btn btn--danger btn--block"
          @click="handleCancelInstallment"
        >Cancel installment plan</button>
        <button
          v-else
          type="button"
          class="btn btn--danger btn--block"
          @click="handleDelete"
        >Delete</button>
      </div>
    </form>
  </BottomSheet>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import BottomSheet from '../shared/BottomSheet.vue'
import { showToast } from '../../utils/toast'
import { getBudgetMonth } from '../../utils/format'
import { useCloudSync } from '../../composables/useCloudSync'
import MoneyInput from '../shared/MoneyInput.vue'
import AccountPicker from '../accounts/AccountPicker.vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { useFinanceStore } from '../../stores/financeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { defaultCategories, getCategoryIcon, categoryLabel } from '../../utils/categoryConfig'
import { useExpenseActions } from '../../composables/useExpenseActions'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  expense: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])
const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()
const { syncNow } = useCloudSync()
const $q = useQuasar()
const { deleteExpense } = useExpenseActions()

const showAllCategories = ref(false)
const moreOpen = ref(false)

const allCategories = computed(() => {
  const custom = settingsStore.customCategories.map(c => c.name || c)
  return [...new Set([...defaultCategories, ...custom])]
})

const expenseCategoryFreq = computed(() => {
  const freq = {}
  for (const exp of financeStore.expenses || []) {
    const cat = (exp.category || '').trim()
    if (cat) freq[cat] = (freq[cat] || 0) + 1
  }
  return freq
})

// Category grid — same pattern as AddExpenseSheet
const visibleCategories = computed(() => {
  const freq = expenseCategoryFreq.value
  const sorted = [...allCategories.value].sort((a, b) => (freq[b] || 0) - (freq[a] || 0))
  const result = sorted.slice(0, 7)
  if (form.category && !result.includes(form.category)) {
    if (allCategories.value.includes(form.category)) {
      result[result.length - 1] = form.category
    }
  }
  return result
})

const hiddenCategories = computed(() =>
  allCategories.value.filter(c => !visibleCategories.value.includes(c))
)

const form = reactive({
  name: '',
  amount: null,
  category: '',
  dueDate: '',
  status: 'pending',
  lentTo: '',
  hasCollectionReminder: false,
  collectionDate: '',
  notes: '',
  fuelLiters: null,
  fuelPricePerLiter: null,
  fuelOdometer: null,
  accountId: null,
  via: null,
  paidFromCash: false,
  paidByCardId: null,
  installmentCurrent: null,
  installmentTotal: null,
  installmentAmount: null
})

const accounts = useAccountsStore()

const source = computed({
  get: () => accounts.sourceOf(form),
  set: value => Object.assign(form, accounts.applySource(value))
})

const showSourcePicker = computed(() => {
  if (form.category === 'cashWithdrawal') return false
  if (accounts.tracking) return true
  return (isPaid.value && !isLend.value) || isFuel.value
})

const isFuel = computed(() => form.category?.toLowerCase() === 'fuel')
const isLend = computed(() => form.category === 'lend')
const isLoanEMI = computed(() => form.category === 'loans' && props.expense?.isInstallment)

const recurringSchedule = computed(() => {
  if (!props.expense?.scheduleId) return null
  return financeStore.recurringSchedules?.find(s => s.id === props.expense.scheduleId)
})

const splitPartnerName = computed(() => {
  if (!props.expense?.splitGroupId) return null
  // Find the partner's expense (the one with splitWith being the other side)
  const partner = financeStore.expenses.find(e =>
    e.splitGroupId === props.expense.splitGroupId &&
    e.id !== props.expense.id
  )
  return props.expense.splitWith || partner?.lentTo || partner?.name || null
})

const scheduleForm = reactive({
  name: '',
  amount: null,
  dayOfMonth: 1
})

watch(recurringSchedule, (s) => {
  if (s) {
    scheduleForm.name = s.name || ''
    scheduleForm.amount = s.amount || null
    scheduleForm.dayOfMonth = s.dayOfMonth || 1
  }
}, { immediate: true })

// Non-loan installments edit the monthly amount (saved as finalAmount below);
// everything else edits the amount itself.
const editsInstallmentAmount = computed(() => !!props.expense?.isInstallment && !isLoanEMI.value)

const isPaid = computed({
  get: () => form.status === 'paid',
  set: (v) => { form.status = v ? 'paid' : 'pending' }
})

const usesMoreOptions = computed(() => !!recurringSchedule.value || editsInstallmentAmount.value || !!form.notes)
const showMore = computed(() => moreOpen.value || usesMoreOptions.value)

const fieldErrors = reactive({})
function clearError(field) { delete fieldErrors[field] }

function validateForm() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!form.name?.trim()) fieldErrors.name = 'Name is required'
  if (!form.amount || form.amount <= 0) fieldErrors.amount = 'Amount is required'
  if (!form.category?.trim()) fieldErrors.category = 'Category is required'
  if (isFuel.value) {
    if (!form.fuelPricePerLiter || form.fuelPricePerLiter <= 0) fieldErrors.fuelPricePerLiter = 'Price/liter is required'
  }
  return Object.keys(fieldErrors).length === 0
}

watch(() => props.modelValue, (open) => {
  if (open) {
    Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
    showAllCategories.value = false
    moreOpen.value = false
  }
})

watch(() => props.expense, (exp) => {
  if (exp) {
    form.name = exp.name || ''
    form.amount = exp.amount || null
    form.category = exp.category || ''
    form.dueDate = exp.dueDate || ''
    form.status = exp.status || 'pending'
    form.lentTo = exp.lentTo || ''
    form.hasCollectionReminder = exp.hasCollectionReminder || false
    form.collectionDate = exp.collectionDate || ''
    form.notes = exp.notes || ''
    form.fuelLiters = exp.fuelLiters || null
    form.fuelPricePerLiter = exp.fuelPricePerLiter || null
    form.fuelOdometer = exp.fuelOdometer || null
    form.accountId = exp.accountId || null
    form.via = exp.via || null
    form.paidFromCash = exp.paidFromCash || false
    form.paidByCardId = exp.paidByCardId || null
    form.installmentCurrent = exp.installmentCurrent || null
    form.installmentTotal = exp.installmentTotal || null
    form.installmentAmount = exp.isInstallment ? exp.amount : null
    // Reset schedule form (recurringSchedule watcher repopulates if applicable)
    scheduleForm.name = ''
    scheduleForm.amount = null
    scheduleForm.dayOfMonth = 1
  }
}, { immediate: true })

// Derive liters from total / price (user enters total + price, liters calculated)
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

async function handleSave() {
  if (!validateForm()) return
  if (!props.expense?.id) return
  const catInfo = getCategoryIcon(form.category, settingsStore.customCategories)

  // Non-loan installments edit form.installmentAmount (separate "Monthly EMI" field).
  // Loan EMIs edit the visible AMOUNT field directly, so they use form.amount —
  // this lets the user pay a custom amount in a given month.
  const finalAmount = (props.expense.isInstallment && !isLoanEMI.value && form.installmentAmount)
    ? form.installmentAmount
    : form.amount

  const result = await financeStore.updateExpense(props.expense.id, {
    name: form.name,
    amount: finalAmount,
    category: form.category,
    icon: catInfo.icon,
    iconColor: catInfo.color,
    dueDate: form.dueDate,
    status: form.status,
    // Only recompute the budget month when the date actually changed. Otherwise
    // preserve the stored monthYear — installments deliberately keep monthYear
    // out of sync with dueDate (cycle rule / skip), and recomputing here would
    // silently move an EMI to another month, making it vanish from the list.
    monthYear: form.dueDate !== props.expense.dueDate
      ? getBudgetMonth(form.dueDate)
      : props.expense.monthYear,
    lentTo: form.lentTo || undefined,
    hasCollectionReminder: form.hasCollectionReminder || undefined,
    collectionDate: form.collectionDate || undefined,
    notes: form.notes?.trim() || undefined,
    fuelLiters: isFuel.value ? form.fuelLiters : undefined,
    fuelPricePerLiter: isFuel.value ? form.fuelPricePerLiter : undefined,
    fuelOdometer: isFuel.value ? form.fuelOdometer : undefined,
    accountId: form.accountId || undefined,
    via: form.via || undefined,
    paidFromCash: form.paidFromCash || undefined,
    paidByCardId: form.paidByCardId || null,
    installmentCurrent: form.installmentCurrent ?? undefined,
    installmentTotal: form.installmentTotal ?? undefined
  })
  if (!result?.success) {
    showToast(result?.errors?.[0] || 'Update failed', 'error')
    return
  }

  // Loan EMI paid (possibly with a custom amount): re-derive the loan from its
  // paid rows and re-amortize the remaining schedule so paying extra finishes
  // the loan sooner. Pending-only edits keep the user's manual amounts.
  if (isLoanEMI.value && form.status === 'paid') {
    const loanId = props.expense.loanId
    if (loanId) financeStore.reamortizeLoan(loanId)
  }

  // Update the recurring schedule if applicable (syncs future unpaid expenses)
  if (recurringSchedule.value) {
    const s = recurringSchedule.value
    const catInfo2 = getCategoryIcon(form.category, settingsStore.customCategories)
    financeStore.updateSchedule(s.id, {
      name: scheduleForm.name || s.name,
      amount: scheduleForm.amount || s.amount,
      dayOfMonth: scheduleForm.dayOfMonth || s.dayOfMonth,
      category: form.category,
      icon: catInfo2.icon,
      iconColor: catInfo2.color,
      accountId: form.accountId || null,
      paidByCardId: form.paidByCardId || null,
      paidFromCash: form.paidFromCash || null,
      via: form.via || null
    })
  }

  showToast('Expense updated', 'edit')
  syncNow()
  emit('update:modelValue', false)
}

async function handleStopRecurring() {
  if (props.expense.scheduleId) {
    financeStore.stopSchedule(props.expense.scheduleId)
    showToast(`${props.expense.name} stopped repeating`, 'info')
  } else if (props.expense.recurringGroupName) {
    financeStore.cancelRecurring(props.expense.recurringGroupName)
    showToast(`${props.expense.name} stopped repeating`, 'info')
  } else {
    await financeStore.updateExpense(props.expense.id, { isRecurring: false })
    showToast(`${props.expense.name} stopped repeating, this entry only`, 'info')
  }
  emit('update:modelValue', false)
}

function handleCancelInstallment() {
  if (!props.expense?.name) return
  const expName = props.expense.name

  // Collect IDs of pending installments to delete (use deleteExpense for proper cleanup)
  const toDelete = []
  if (props.expense.installmentGroupId) {
    financeStore.expenses.forEach(e => {
      if (e.status !== 'paid' && e.installmentGroupId === props.expense.installmentGroupId) {
        toDelete.push(e.id)
      }
    })
  } else {
    const groupName = props.expense.recurringGroupName || ''
    const baseName = expName.replace(/ EMI$/, '')
    financeStore.expenses.forEach(e => {
      if (e.status === 'paid') return
      if (!e.isInstallment) return
      const matchesName = e.name === expName || e.name === baseName || e.name === baseName + ' EMI'
      const matchesGroup = groupName && e.recurringGroupName === groupName
      if (matchesName || matchesGroup) toDelete.push(e.id)
    })
  }

  // Delete via store action (ensures cash/loan reversal + sync tracking)
  toDelete.forEach(id => financeStore.deleteExpense(id))

  showToast(`${expName}: plan cancelled`, 'delete')
  syncNow()
  emit('update:modelValue', false)
}

const pendingInstallmentCount = computed(() => {
  if (!props.expense?.installmentGroupId) return 0
  return financeStore.expenses.filter(e =>
    e.installmentGroupId === props.expense.installmentGroupId && e.status !== 'paid'
  ).length
})

function handlePayOffRemaining() {
  if (!props.expense?.installmentGroupId) return
  const result = financeStore.payOffInstallments(
    props.expense.installmentGroupId,
    null,
    financeStore.currentMonth
  )
  if (result.success) {
    showToast(`${result.paidCount} installment${result.paidCount > 1 ? 's' : ''} paid off early`)
    syncNow()
  }
  emit('update:modelValue', false)
}


function handleSkipMonth() {
  if (!props.expense?.id) return
  const skipChainCount = financeStore.expenses.filter(e =>
    e.category === 'loans' &&
    e.isInstallment &&
    e.status !== 'paid' &&
    ((props.expense.loanId && e.loanId === props.expense.loanId) ||
     (!props.expense.loanId && e.installmentGroupId === props.expense.installmentGroupId)) &&
    (e.installmentCurrent || 0) >= (props.expense.installmentCurrent || 0)
  ).length
  const later = skipChainCount - 1
  $q.dialog({
    title: 'Skip this EMI?',
    message: `This payment${later > 0 ? ` and the ${later} after it` : ''} move forward one month. The loan total stays the same.`,
    cancel: { label: 'Keep', flat: true, color: 'dark' },
    ok: { label: 'Skip month', unelevated: true, color: 'dark' }
  }).onOk(confirmSkip)
}

function confirmSkip() {
  if (!props.expense?.id) return
  const result = financeStore.skipEmiMonth(props.expense.id)
  if (result.success) {
    showToast(`Shifted ${result.shiftedCount} EMI${result.shiftedCount > 1 ? 's' : ''} forward 1 month`)
    syncNow()
    emit('update:modelValue', false)
  } else {
    showToast(result.errors?.[0] || 'Could not skip month', 'error')
  }
}

function handleDelete() {
  const e = props.expense
  if (!e?.id) return
  $q.dialog({
    title: `Delete ${e.name}?`,
    message: e.isRecurring
      ? 'It also stops repeating. You can restore it from Recently deleted.'
      : 'You can restore it from Recently deleted.',
    cancel: { label: 'Keep', flat: true, color: 'dark' },
    ok: { label: 'Delete', unelevated: true, color: 'negative' }
  }).onOk(() => {
    deleteExpense(e.id)
    syncNow()
    emit('update:modelValue', false)
  })
}
</script>

<style lang="scss" scoped>
.xform__notice { margin-bottom: 16px; }

.xform__amount {
  height: 56px;
  .money-lkr { font-size: var(--fs-section); }
  :deep(.money-input) { font-size: 28px; font-weight: 600; }
}

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

.switch-row__title { display: flex; align-items: center; gap: 8px; }

.xform__more {
  margin-top: 8px;
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
.xform__group-title { font-weight: 500; }
.xform__group-help { margin: 2px 0 12px; }
.xform__save { margin-top: 8px; }

.xform__actions {
  display: grid;
  gap: 8px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--rule);
}
</style>
