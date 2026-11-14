<template>
  <BottomSheet
    :model-value="modelValue"
    :title="card ? `Pay ${card.name}` : 'Pay card'"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form v-if="card" @submit.prevent="handleSave">
      <p class="field-help payoff-context num">
        Owed LKR {{ formatMoney(cardOutstanding) }}<template v-if="plan">. Your plan: pay {{ planLabel }}.</template>
      </p>

      <div class="field">
        <label class="field-label" for="payoff-amount">Amount</label>
        <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.amount }">
          <span class="money-lkr">LKR</span>
          <MoneyInput
            id="payoff-amount"
            v-model="form.amount"
            class="field-input num"
            :placeholder="formatMoney(cardOutstanding)"
            :error="false"
            @update:modelValue="clearError('amount')"
          />
        </div>
        <span v-if="fieldErrors.amount" class="field-error-msg">{{ fieldErrors.amount }}</span>
        <div class="chips payoff-chips">
          <button type="button" class="chip" @click="pick('full', cardOutstanding)">All of it</button>
          <button type="button" class="chip" @click="pick('half', Math.round(cardOutstanding / 2))">Half</button>
          <button type="button" class="chip" @click="pick('min', Math.min(cardOutstanding, Math.max(1, Math.round(cardOutstanding * ((card.minPaymentPercent || 5) / 100)))))">Minimum</button>
        </div>
        <p v-if="form.amount > 0 && form.amount < cardOutstanding - 1" class="field-help num">
          LKR {{ formatMoney(Math.max(0, cardOutstanding - (form.amount || 0))) }} stays on the card, and you are reminded before the next settlement.
        </p>
      </div>

      <div v-if="accounts.tracking" class="field">
        <p class="field-label">Paid from</p>
        <AccountPicker v-model="form.source" :cards="false" :paypal="false" :wallets="['lkr', 'cash', 'usd']" label="Paid from" />
      </div>

      <label class="field">
        <span class="field-label">Date paid</span>
        <input v-model="form.date" type="date" class="field-input num" />
      </label>

      <label class="field">
        <span class="field-label">Note</span>
        <textarea v-model="form.note" class="field-input" placeholder="Optional" rows="2" />
      </label>

      <button type="submit" class="btn btn--primary btn--block" :disabled="saving || !cardOutstanding || cardOutstanding <= 0">
        {{ saving ? 'Saving' : 'Save payment' }}
      </button>
    </form>
  </BottomSheet>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { format } from 'date-fns'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import AccountPicker from '../accounts/AccountPicker.vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { showToast } from '../../utils/toast'
import { formatMoney, getBudgetMonth } from '../../utils/format'
import { useCreditCardStore } from '../../stores/creditCardStore'
import { useFinanceStore } from '../../stores/financeStore'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  card: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue'])

const cardStore = useCreditCardStore()
const financeStore = useFinanceStore()
const accounts = useAccountsStore()

const form = reactive({
  amount: null,
  date: format(new Date(), 'yyyy-MM-dd'),
  note: '',
  source: '',
  settlementType: null
})

const fieldErrors = reactive({})
const saving = ref(false)

// Pay this specific card against its OWN outstanding (not the combined credit
// line). Linked cards share a limit, but each card carries its own balance and
// gets its own statement, so payments must be recorded per-card.
const cardOutstanding = computed(() => props.card?.currentOutstanding || 0)
const plan = computed(() => props.card ? cardStore.getSettlementPlan(props.card) : null)
const planLabel = computed(() => {
  if (!plan.value) return ''
  const s = plan.value.strategy
  return s === 'custom' ? `custom ${formatMoney(plan.value.customAmount || 0)}` : s
})

function pick(type, amount) {
  form.amount = amount
}

function clearError(key) {
  if (fieldErrors[key]) delete fieldErrors[key]
}

// Classify the payment by amount vs the card's outstanding & plan.
function classifySettlement(amount) {
  const out = cardOutstanding.value
  if (!out || amount >= out - 1) return 'full'
  const minAmt = Math.round(out * ((props.card?.minPaymentPercent || 5) / 100))
  const halfAmt = Math.round(out / 2)
  if (Math.abs(amount - halfAmt) <= 1) return 'half'
  if (Math.abs(amount - minAmt) <= 1) return 'min'
  return 'custom'
}

async function handleSave() {
  if (saving.value) return
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!props.card) return

  if (!form.amount || form.amount <= 0) {
    fieldErrors.amount = 'Amount must be greater than 0'
    return
  }

  // Record the payment against the card the user actually tapped, so each card's
  // own balance is reduced and the expense is named for that card.
  // Create a creditCardPayment expense (excluded from totalSpent, counted in debtRepaid).
  // The financeStore mutation hooks will call cardStore.applyPayment().
  const expense = {
    name: `${props.card.name} Payment`,
    amount: Number(form.amount),
    category: 'creditCardPayment',
    icon: 'credit_card',
    iconColor: props.card.color || '#C0C1FF',
    dueDate: form.date,
    monthYear: getBudgetMonth(form.date),
    status: 'paid',
    isRecurring: false,
    isInstallment: false,
    cardId: props.card.id,
    ...(accounts.tracking ? (({ accountId, paidFromCash }) => ({ accountId: accountId || undefined, paidFromCash: paidFromCash || undefined }))(accounts.applySource(form.source)) : {}),
    settlementType: classifySettlement(Number(form.amount)),
    notes: form.note?.trim() || ''
  }

  saving.value = true
  try {
    const result = await financeStore.addExpense(expense)
    if (result?.success !== false) {
      showToast(`Paid LKR ${formatMoney(form.amount)} to ${props.card.name}`, 'paid')
      emit('update:modelValue', false)
    } else {
      showToast(result?.errors?.[0] || 'Failed to save', 'error')
    }
  } finally {
    saving.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val && props.card) {
    // Prefill with this card's own outstanding balance.
    form.amount = props.card.currentOutstanding || null
    form.date = format(new Date(), 'yyyy-MM-dd')
    form.note = ''
    form.source = accounts.defaultSource({ accountsOnly: true })
    form.settlementType = null
    Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  }
})
</script>

<style lang="scss" scoped>
.payoff-context { margin: 0 0 16px; font-size: var(--fs-body); }
.payoff-chips { margin-top: 8px; }
</style>
