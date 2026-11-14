<template>
  <q-page v-if="account">
    <PageHead :title="account.name" back>
      <button class="icon-btn" aria-label="Edit account" @click="showEdit = true">
        <span class="material-symbols-outlined">edit</span>
      </button>
    </PageHead>
    <p v-if="subtitle" class="page-sub num">{{ subtitle }}</p>

    <section class="panel panel--pad">
      <p class="figure-label">Balance</p>
      <p class="figure figure--lead num" :class="{ 'is-zero': balance === null }">
        <template v-if="balance === null">Not set</template>
        <template v-else><span class="unit">{{ account.currency === 'USD' ? 'USD' : 'LKR' }}</span>{{ formatAmount(balance, account.currency) }}</template>
      </p>
      <p v-if="account.currency === 'USD' && balance && accounts.fxRate" class="acct-sub num">About {{ money(balance * accounts.fxRate) }} at today's rate</p>
      <p class="acct-status num" :class="statusClass">
        <span class="material-symbols-outlined">{{ statusIcon }}</span>{{ statusText }}
      </p>
      <div class="btn-row">
        <button class="btn btn--primary" @click="openCheck()">{{ balance === null ? 'Set balance' : 'Check balance' }}</button>
        <button class="btn btn--outline" @click="showMove = true">Move money</button>
      </div>
    </section>

    <div v-if="status.state === 'off'" class="notice notice--warning acct-notice">
      <span class="material-symbols-outlined">warning</span>
      <span class="num">
        Your bank said {{ money(status.bank, account.currency) }} {{ status.source === 'sms' && status.label ? `after ${status.label}` : '' }} on {{ when(status.at) }}. Floww had {{ money(status.app, account.currency) }} then.
        <button type="button" @click="openCheck(status.bank, status.at)">Fix it</button>
      </span>
    </div>

    <div v-if="rebase" class="notice notice--warning acct-notice">
      <span class="material-symbols-outlined">info</span>
      <span class="num">
        Your bank's last message says {{ money(rebase.balance, account.currency) }} on {{ when(rebase.at) }}, but Floww started this account from {{ money(account.openingBalance, account.currency) }}.
        <button type="button" @click="applyRebase">Start from the bank's figure</button>
      </span>
    </div>

    <div v-if="waiting.length" class="notice acct-notice">
      <span class="material-symbols-outlined">sms</span>
      <span>{{ waiting.length }} bank {{ waiting.length === 1 ? 'message' : 'messages' }} for this account {{ waiting.length === 1 ? 'is' : 'are' }} not added yet. <router-link to="/sms-import">Add {{ waiting.length === 1 ? 'it' : 'them' }}</router-link></span>
    </div>

    <div class="kpis acct-kpis">
      <div>
        <p class="figure-label">In this cycle</p>
        <p class="figure num" :class="{ 'is-zero': !cycle.in }">{{ formatAmount(cycle.in, account.currency) }}</p>
      </div>
      <div>
        <p class="figure-label">Out this cycle</p>
        <p class="figure num" :class="{ 'is-zero': !cycle.out }">{{ formatAmount(cycle.out, account.currency) }}</p>
      </div>
    </div>

    <section class="section">
      <div class="section-head"><h2>History</h2></div>
      <section v-for="g in groups" :key="g.key">
        <p class="group-label num"><span>{{ g.label }}</span></p>
        <div class="list">
          <button v-for="m in g.items" :key="`${m.type}-${m.id}`" type="button" class="row" @click="open(m)">
            <span class="row__icon material-symbols-outlined">{{ m.view.icon }}</span>
            <span class="row__main">
              <span class="row__title">{{ m.view.title }}</span>
              <span class="row__meta num">{{ m.view.meta }}</span>
            </span>
            <span class="row__end acct-hist__end">
              <span class="row__amount num">{{ signedMoney(m.amount, account.currency) }}</span>
              <span v-if="m.balance !== null" class="acct-hist__bal num">{{ formatAmount(m.balance, account.currency) }}</span>
            </span>
          </button>
        </div>
      </section>
      <p v-if="!groups.length && account.openingAt" class="empty">Nothing recorded since tracking started. New payments, money in and moves for this account show here.</p>
      <div v-if="account.openingAt" class="list acct-opening">
        <div class="row row--static">
          <span class="row__icon material-symbols-outlined">flag</span>
          <span class="row__main">
            <span class="row__title">Starting balance</span>
            <span class="row__meta num">{{ when(account.openingAt) }}</span>
          </span>
          <span class="row__end row__amount num">{{ formatAmount(account.openingBalance, account.currency) }}</span>
        </div>
      </div>
    </section>

    <AccountSheet v-model="showEdit" :account="account" @removed="router.replace('/wallets')" />
    <CheckBalanceSheet v-model="showCheck" :account-id="account.id" :bank-balance="checkBalance" :at="checkAt" />
    <TransferSheet v-model="showMove" :record="moveRecord" :prefill="movePrefill" @update:model-value="v => !v && (moveRecord = null)" />
    <IncomeSheet v-model="showIncome" :income="editingIncome" />
    <EditExpenseSheet v-model="showExpense" :expense="editingExpense" />
    <BottomSheet v-model="showCorrection" title="Correction">
      <p class="acct-sheet-text num">{{ correctionText }}</p>
      <div class="btn-row">
        <button class="btn btn--outline" @click="showCorrection = false">Keep it</button>
        <button class="btn btn--danger" @click="removeCorrection">Delete</button>
      </div>
    </BottomSheet>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { format, parseISO, isToday, isYesterday, isValid } from 'date-fns'
import PageHead from '../components/layout/PageHead.vue'
import BottomSheet from '../components/shared/BottomSheet.vue'
import AccountSheet from '../components/accounts/AccountSheet.vue'
import CheckBalanceSheet from '../components/accounts/CheckBalanceSheet.vue'
import TransferSheet from '../components/accounts/TransferSheet.vue'
import IncomeSheet from '../components/accounts/IncomeSheet.vue'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'
import { useAccountsStore } from '../stores/accountsStore'
import { useFinanceStore } from '../stores/financeStore'
import { useLedgerDisplay } from '../composables/useLedgerDisplay'
import { useSmsInbox } from '../composables/useSmsInbox'
import { useBankChecks } from '../composables/useBankChecks'
import { money, signedMoney, formatAmount, INSTITUTIONS } from '../utils/wallets'
import { getBudgetMonth } from '../utils/format'
import { showToast } from '../utils/toast'

const route = useRoute()
const router = useRouter()
const accounts = useAccountsStore()
const finance = useFinanceStore()
const { describe } = useLedgerDisplay()
const { fresh, draft } = useSmsInbox()
const { rebaseOffer } = useBankChecks()

const account = computed(() => accounts.getAccount(String(route.params.accountId || '')))
const rebase = computed(() => (account.value ? rebaseOffer(account.value.id) : null))

function applyRebase() {
  accounts.rebaseOpening(account.value.id, rebase.value.balance, rebase.value.at)
  showToast(`${account.value.name} now starts from your bank's figure`, 'paid')
}
const balance = computed(() => (account.value ? accounts.balanceOf(account.value.id) : null))
const status = computed(() => (account.value ? accounts.statusOf(account.value.id) : { state: 'missing' }))

const subtitle = computed(() => {
  const a = account.value
  if (!a || a.wallet === 'cash') return ''
  const parts = [(INSTITUTIONS[a.institution] || INSTITUTIONS.other).name]
  if (a.numberLast4) parts.push(`Account ••${a.numberLast4}`)
  if (a.cardLast4?.length) parts.push(`Debit card ${a.cardLast4.map(c => `••${c}`).join(', ')}`)
  if (a.paypal) parts.push('PayPal')
  return parts.join(' · ')
})

function when(ts) {
  return ts ? format(new Date(ts), 'd MMM, h:mm a') : ''
}

const statusIcon = computed(() => ({ matched: 'check_circle', off: 'warning', unset: 'info', unchecked: 'schedule' }[status.value.state] || 'info'))
const statusClass = computed(() => ({ 'is-positive': status.value.state === 'matched' }))
const statusText = computed(() => {
  const s = status.value
  if (s.state === 'matched') return `Matches your bank, ${when(s.at)}`
  if (s.state === 'off') return `Off by ${money(Math.abs(s.diff), account.value.currency)} from your bank`
  if (s.state === 'unset') return 'Type what it holds today to start tracking'
  return `Tracking since ${when(account.value.openingAt)}. Not checked against your bank yet.`
})

const waiting = computed(() => {
  const id = account.value?.id
  if (!id) return []
  return fresh.value.filter(tx => {
    const d = draft(tx)
    return d.accountId === id || d.toAccountId === id
  })
})

const history = computed(() => (account.value ? accounts.historyOf(account.value.id) : []))

const cycle = computed(() => {
  const month = getBudgetMonth()
  let inSum = 0
  let outSum = 0
  for (const m of history.value) {
    if (!m.date || getBudgetMonth(m.date) !== month) continue
    if (m.amount > 0) inSum += m.amount
    else outSum += -m.amount
  }
  return { in: inSum, out: outSum }
})

function dayHeading(ts) {
  const d = new Date(ts)
  if (isToday(d)) return `Today, ${format(d, 'd MMM')}`
  if (isYesterday(d)) return `Yesterday, ${format(d, 'd MMM')}`
  return format(d, 'EEEE, d MMM')
}

const groups = computed(() => {
  const out = []
  let current = null
  for (const m of history.value) {
    const key = format(new Date(m.at), 'yyyy-MM-dd')
    if (!current || current.key !== key) {
      current = { key, label: dayHeading(m.at), items: [] }
      out.push(current)
    }
    current.items.push({ ...m, view: describe(m) })
  }
  return out
})

const showEdit = ref(false)
const showCheck = ref(false)
const checkBalance = ref(null)
const checkAt = ref(null)
function openCheck(bank = null, at = null) {
  checkBalance.value = bank
  checkAt.value = at
  showCheck.value = true
}

const showMove = ref(false)
const moveRecord = ref(null)
const movePrefill = computed(() => {
  const a = account.value
  if (!a || moveRecord.value) return null
  if (a.wallet === 'usd') return { preset: 'exchange', from: `acct:${a.id}` }
  if (a.wallet === 'cash') return { preset: 'banks', from: `acct:${a.id}` }
  return { preset: 'cash', from: `acct:${a.id}` }
})

const showIncome = ref(false)
const editingIncome = ref(null)
const showExpense = ref(false)
const editingExpense = ref(null)
const showCorrection = ref(false)
const editingCorrection = ref(null)

const correctionText = computed(() => {
  const c = editingCorrection.value
  if (!c || !account.value) return ''
  return `${signedMoney(c.amount, account.value.currency)} on ${when(c.at)}, added so Floww matched your bank. Delete it only if you have since added the missing record.`
})

function open(m) {
  const kind = m.view.edit
  if (kind === 'expense') {
    editingExpense.value = finance.expenses.find(e => e.id === m.id) || m.item
    showExpense.value = true
  } else if (kind === 'move-expense') {
    moveRecord.value = { kind: 'expense', id: m.id, item: m.item }
    showMove.value = true
  } else if (kind === 'transfer') {
    moveRecord.value = { kind: 'transfer', id: m.id, item: m.item }
    showMove.value = true
  } else if (kind === 'income') {
    editingIncome.value = m.item
    showIncome.value = true
  } else if (kind === 'correction') {
    editingCorrection.value = m.item
    showCorrection.value = true
  } else if (kind === 'salary') {
    router.push('/salary')
  } else if (kind === 'lend') {
    router.push('/lend-tracker')
  }
}

function removeCorrection() {
  accounts.deleteCorrection(editingCorrection.value.id)
  showCorrection.value = false
  showToast('Correction deleted', 'info')
}
</script>

<style lang="scss" scoped>
.acct-sub { margin-top: 4px; color: var(--muted); }

.acct-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: var(--muted);
  .material-symbols-outlined { font-size: 18px; }
  &.is-positive { color: var(--positive); }
}

.acct-notice { margin-top: 12px; }
.acct-kpis { margin-top: 12px; }

.acct-hist__end { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.acct-hist__bal { font-size: var(--fs-small); color: var(--muted); }

.acct-opening { margin-top: 12px; }
.row--static { cursor: default; &:active { background: none; } }

.acct-sheet-text { color: var(--muted); margin-bottom: 8px; }
</style>
