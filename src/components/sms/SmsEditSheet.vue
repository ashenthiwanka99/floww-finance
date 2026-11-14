<template>
  <BottomSheet
    :model-value="modelValue"
    title="Check this transaction"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form v-if="transaction" class="xform" novalidate @submit.prevent="handleImport">
      <div class="sms-raw">
        <button type="button" class="sms-raw__toggle" :aria-expanded="showRaw" @click="showRaw = !showRaw">
          <span>Message from {{ transaction.bankDisplay }}</span>
          <span class="material-symbols-outlined">{{ showRaw ? 'expand_less' : 'expand_more' }}</span>
        </button>
        <p v-if="showRaw" class="sms-raw__body">{{ transaction.rawBody }}</p>
      </div>

      <p v-if="kind === 'refund'" class="notice sms-refund"><span class="material-symbols-outlined">undo</span><span>This is a refund on your card. Adding it lowers what you owe on the card.</span></p>

      <div v-else-if="accounts.tracking" class="field">
        <div class="seg seg--block" role="group" aria-label="What this is">
          <button type="button" :aria-pressed="kind === 'expense'" @click="kind = 'expense'">Expense</button>
          <button type="button" :aria-pressed="kind === 'income'" @click="kind = 'income'">Money in</button>
          <button type="button" :aria-pressed="kind === 'move'" @click="kind = 'move'">Move</button>
        </div>
      </div>

      <template v-if="kind === 'refund'" />

      <template v-else-if="kind === 'income'">
        <IncomeFields :form="incomeForm" :errors="fieldErrors" uid="sms-income" />
      </template>

      <template v-else-if="kind === 'move'">
        <TransferFields :form="moveForm" :errors="fieldErrors" uid="sms-move" />
      </template>

      <template v-else-if="kind === 'expense'">
        <div class="field">
          <label class="field-label" for="sms-amount">Amount</label>
          <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.amount }">
            <span class="money-lkr">LKR</span>
            <MoneyInput id="sms-amount" v-model="form.amount" decimal placeholder="0" :error="false" @update:model-value="clearError('amount')" />
          </div>
          <p v-if="form.usdAmount" class="field-help num">{{ money(form.usdAmount, 'USD') }} in the message, converted at today's rate. Change it to what your bank charged.</p>
          <p v-if="fieldErrors.amount" class="field-error-msg">{{ fieldErrors.amount }}</p>
        </div>

        <div class="field">
          <label class="field-label" for="sms-name">Name</label>
          <input id="sms-name" v-model="form.name" type="text" class="field-input" :class="{ 'field-error': fieldErrors.name }" @input="clearError('name')" />
          <p v-if="fieldErrors.name" class="field-error-msg">{{ fieldErrors.name }}</p>
        </div>

        <div class="field">
          <p class="field-label">Category</p>
          <div class="chips sms-wrap" role="radiogroup" aria-label="Category">
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
              class="chip sms-more"
              :aria-expanded="showAllCategories"
              @click="showAllCategories = !showAllCategories"
            >{{ showAllCategories ? 'Fewer' : `${hiddenCategories.length} more` }}</button>
          </div>
        </div>

        <div v-if="form.status === 'paid' && form.category !== 'cashWithdrawal'" class="field">
          <p class="field-label">Paid from</p>
          <AccountPicker v-model="source" />
          <p v-if="matchNote" class="field-help num">{{ matchNote }}</p>
        </div>

        <div class="details">
          <button type="button" class="details__toggle" :aria-expanded="showDetails" @click="showDetails = !showDetails">
            <span>
              <span class="details__title">More details</span>
              <span class="details__sub num">{{ detailsSummary }}</span>
            </span>
            <span class="material-symbols-outlined">{{ showDetails ? 'expand_less' : 'expand_more' }}</span>
          </button>
          <div v-if="showDetails">
            <div class="field">
              <label class="field-label" for="sms-date">Date</label>
              <input id="sms-date" v-model="form.dueDate" type="date" class="field-input num" />
            </div>

            <div class="switch-row">
              <span class="switch-row__text">
                <span class="switch-row__title">Paid</span>
                <span class="switch-row__desc">{{ form.status === 'paid' ? 'Already paid' : 'Still to pay, shows in Bills' }}</span>
              </span>
              <button
                type="button"
                role="switch"
                class="switch"
                :aria-checked="form.status === 'paid'"
                aria-label="Paid"
                @click="form.status = form.status === 'paid' ? 'pending' : 'paid'"
              />
            </div>

            <div class="field">
              <label class="field-label" for="sms-notes">Note</label>
              <textarea id="sms-notes" v-model="form.notes" class="field-input" rows="2" placeholder="Optional"></textarea>
            </div>
          </div>
        </div>
      </template>

      <p v-if="fieldErrors.form" class="field-error-msg">{{ fieldErrors.form }}</p>

      <div class="btn-row">
        <button type="button" class="btn btn--outline" @click="handleSkip">Skip</button>
        <button type="submit" class="btn btn--primary">{{ submitLabel }}</button>
      </div>
    </form>
  </BottomSheet>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { format } from 'date-fns'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import AccountPicker from '../accounts/AccountPicker.vue'
import IncomeFields from '../accounts/IncomeFields.vue'
import TransferFields from '../accounts/TransferFields.vue'
import { useFinanceStore } from '../../stores/financeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useAccountsStore } from '../../stores/accountsStore'
import { useSmsInbox } from '../../composables/useSmsInbox'
import { useMoneyRecords, blankIncome, blankMove } from '../../composables/useMoneyRecords'
import { defaultCategories, getCategoryIcon, categoryLabel } from '../../utils/categoryConfig'
import { money } from '../../utils/wallets'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  transaction: { type: Object, default: null },
  existingEdit: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue', 'skip', 'import'])

const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()
const accounts = useAccountsStore()
const { draft } = useSmsInbox()
const { validateIncome, validateMove, moveEnds } = useMoneyRecords()

const showRaw = ref(false)
const showAllCategories = ref(false)
const showDetails = ref(false)
const kind = ref('expense')

const customCategories = computed(() => settingsStore.customCategories || [])

const form = reactive({
  name: '',
  amount: null,
  usdAmount: null,
  category: 'others',
  dueDate: '',
  status: 'paid',
  accountId: null,
  paidFromCash: false,
  paidByCardId: null,
  via: null,
  notes: ''
})

const incomeForm = reactive(blankIncome(accounts))
const moveForm = reactive(blankMove(accounts))

const source = computed({
  get: () => accounts.sourceOf(form),
  set: value => Object.assign(form, accounts.applySource(value))
})

const matchNote = computed(() => {
  const tx = props.transaction
  if (!tx || props.existingEdit) return ''
  if (form.paidByCardId && tx.card) return `Matched the card ending ${tx.card} from the message.`
  const a = accounts.getAccount(form.accountId)
  if (a && (tx.account || tx.card)) return `Matched ${a.name} from the message.`
  return ''
})

const detailsSummary = computed(() => {
  const parts = []
  if (form.dueDate) parts.push(format(new Date(`${form.dueDate}T00:00:00`), 'd MMM'))
  parts.push(form.status === 'paid' ? 'paid' : 'still to pay')
  return parts.join(' · ')
})

const submitLabel = computed(() => ({ income: 'Add money in', move: 'Add move', refund: 'Add refund' }[kind.value] || 'Add expense'))

const fieldErrors = reactive({})

function clearError(field) { delete fieldErrors[field] }

watch(() => [props.modelValue, props.transaction, props.existingEdit], ([open, tx, edit]) => {
  if (!open || !tx) return
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  showRaw.value = false
  showAllCategories.value = false
  showDetails.value = false

  const d = edit ? { kind: 'expense', ...edit } : draft(tx)
  kind.value = d.kind === 'refund' ? 'refund' : (accounts.tracking ? (d.kind || 'expense') : 'expense')

  Object.assign(form, {
    name: d.name ?? '',
    amount: d.amount ?? null,
    usdAmount: d.usdAmount ?? null,
    category: d.kind === 'expense' ? (d.category ?? 'others') : 'others',
    dueDate: d.dueDate ?? format(new Date(tx.smsDate || Date.now()), 'yyyy-MM-dd'),
    status: d.status ?? 'paid',
    accountId: d.accountId ?? null,
    paidFromCash: !!d.paidFromCash,
    paidByCardId: d.paidByCardId ?? null,
    via: d.via ?? null,
    notes: d.notes ?? ''
  })
  if (d.kind === 'expense' && !form.paidByCardId && !form.accountId && accounts.tracking) {
    Object.assign(form, accounts.applySource(accounts.defaultSource()))
  }

  Object.assign(incomeForm, blankIncome(accounts, 'other'), {
    amount: d.amount ?? null,
    name: d.kind === 'income' ? d.name : '',
    date: form.dueDate,
    account: d.accountId ? `acct:${d.accountId}` : blankIncome(accounts).account
  })

  const fresh = blankMove(accounts, tx.type === 'withdrawal' ? 'cash' : 'banks')
  Object.assign(moveForm, fresh, {
    from: d.accountId ? `acct:${d.accountId}` : fresh.from,
    to: d.toAccountId ? `acct:${d.toAccountId}` : fresh.to,
    amount: d.amount ?? null,
    date: form.dueDate
  })
}, { immediate: true })

const categoryFreq = computed(() => {
  const freq = {}
  financeStore.expenses.forEach(e => {
    if (e.category) freq[e.category] = (freq[e.category] || 0) + 1
  })
  return freq
})

const allCategories = computed(() => {
  const custom = customCategories.value.map(c => c.name || c)
  return [...new Set([...defaultCategories, ...custom])]
})

const visibleCategories = computed(() => {
  const sorted = [...allCategories.value].sort((a, b) => (categoryFreq.value[b] || 0) - (categoryFreq.value[a] || 0))
  const top = sorted.slice(0, 7)
  if (form.category && !top.includes(form.category) && allCategories.value.includes(form.category)) {
    top[top.length - 1] = form.category
  }
  return top
})

const hiddenCategories = computed(() =>
  allCategories.value.filter(c => !visibleCategories.value.includes(c))
)

function selectCategory(cat) {
  form.category = cat
}

function validateExpenseForm() {
  if (!form.name?.trim()) fieldErrors.name = 'Name is required'
  if (!form.amount || form.amount <= 0) fieldErrors.amount = 'Amount is required'
}

function buildPayload() {
  if (kind.value === 'refund') return draft(props.transaction)
  if (kind.value === 'income') {
    return {
      kind: 'income',
      incomeKind: incomeForm.kind,
      accountId: incomeForm.account.replace(/^acct:/, ''),
      amount: Number(incomeForm.amount),
      name: incomeForm.kind === 'salary' ? 'Salary' : (incomeForm.name?.trim() || 'Money in'),
      dueDate: incomeForm.date,
      note: incomeForm.note
    }
  }
  if (kind.value === 'move') {
    const ends = moveEnds(moveForm)
    return {
      kind: 'move',
      accountId: ends.from?.id,
      toAccountId: ends.to?.id,
      toCardId: ends.toCard?.id,
      amount: Number(moveForm.amount),
      toAmount: ends.sameCurrency ? Number(moveForm.amount) : Number(moveForm.toAmount),
      dueDate: moveForm.date,
      note: moveForm.note
    }
  }
  const catInfo = getCategoryIcon(form.category, customCategories.value)
  return {
    kind: 'expense',
    name: form.name.trim(),
    amount: form.amount,
    usdAmount: form.usdAmount || undefined,
    category: form.category,
    icon: catInfo.icon,
    iconColor: catInfo.color,
    dueDate: form.dueDate,
    status: form.status,
    accountId: form.accountId || undefined,
    paidFromCash: form.paidFromCash || undefined,
    paidByCardId: form.paidByCardId || undefined,
    via: form.via || undefined,
    notes: form.notes?.trim() || undefined
  }
}

function handleSkip() {
  if (!props.transaction?.fingerprint) return
  emit('skip', props.transaction)
  emit('update:modelValue', false)
}

function handleImport() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (kind.value === 'income') Object.assign(fieldErrors, validateIncome(incomeForm))
  else if (kind.value === 'move') Object.assign(fieldErrors, validateMove(moveForm))
  else validateExpenseForm()
  if (Object.keys(fieldErrors).length) return
  if (!props.transaction?.fingerprint) return
  emit('import', { fingerprint: props.transaction.fingerprint, expense: buildPayload() })
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
.switch-row__title, .switch-row__desc { display: block; }

.details { margin-bottom: 8px; border-top: 1px solid var(--rule); }

.details__toggle {
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
  font: inherit;
  .material-symbols-outlined { color: var(--muted); }
}

.details__title { display: block; font-weight: 500; }
.details__sub { display: block; font-size: var(--fs-small); color: var(--muted); line-height: 16px; margin-top: 2px; }

.sms-raw {
  margin-bottom: 16px;
  border-radius: var(--radius-card);
  background: var(--raised);
}

.sms-raw__toggle {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: var(--muted);
  font-size: var(--fs-body);
  text-align: left;
  cursor: pointer;
}

.sms-raw__body {
  padding: 0 12px 12px;
  font-size: var(--fs-small);
  line-height: 18px;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.sms-wrap { flex-wrap: wrap; overflow: visible; }
.sms-refund { margin-bottom: 16px; }
.sms-more { color: var(--muted); }
</style>
