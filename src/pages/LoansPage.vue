<template>
  <q-page>
    <q-pull-to-refresh @refresh="onRefresh" color="dark">
      <PageHead title="Loans" back>
        <button class="btn btn--primary btn--small" @click="showSheet = true">
          <span class="material-symbols-outlined">add</span>Add loan
        </button>
      </PageHead>

      <template v-if="financeStore.loans.length">
        <div class="kpis">
          <div>
            <p class="figure-label">Owed</p>
            <p class="figure num" :class="{ 'is-zero': !totalDebt }">{{ formatMoney(totalDebt) }}</p>
          </div>
          <div>
            <p class="figure-label">Paid this cycle</p>
            <p class="figure num" :class="{ 'is-zero': !paidThisMonth }">{{ formatMoney(paidThisMonth) }}</p>
          </div>
          <div>
            <p class="figure-label">Still due</p>
            <p class="figure num" :class="{ 'is-zero': !upcomingThisMonth }">{{ formatMoney(upcomingThisMonth) }}</p>
          </div>
        </div>

        <section class="section">
          <div class="section-head"><h2>Active <span class="num head-count">{{ filteredActiveLoans.length }}</span></h2></div>

          <div v-if="lenderGroups.length > 1" class="chips lender-chips">
            <button type="button" class="chip" :class="{ on: !activeLender }" @click="activeLender = null">
              All <span class="num">{{ formatMoney(totalPendingAll) }}</span>
            </button>
            <button
              v-for="g in lenderGroups"
              :key="g.lender"
              type="button"
              class="chip"
              :class="{ on: activeLender === g.lender }"
              @click="activeLender = activeLender === g.lender ? null : g.lender"
            >{{ g.lender }} <span class="num">{{ formatMoney(g.pending) }}</span></button>
          </div>

          <div v-if="filteredActiveLoans.length" class="list">
            <LoanCard
              v-for="loan in filteredActiveLoans"
              :key="loan.id"
              :loan="loan"
              :total-debt="totalDebt"
              @edit="onEditLoan"
              @complete="onCompleteLoan"
              @delete-loan="onDeleteLoan"
              @payoff="handlePayoff"
            />
          </div>
          <p v-else class="empty">Every loan is paid off.</p>
        </section>

        <section v-if="completedLoans.length" class="section">
          <button type="button" class="section-head done-toggle" :aria-expanded="showCompleted" @click="showCompleted = !showCompleted">
            <h2>Paid off <span class="num head-count">{{ completedLoans.length }}</span></h2>
            <span class="material-symbols-outlined">{{ showCompleted ? 'expand_less' : 'expand_more' }}</span>
          </button>
          <div v-if="showCompleted" class="list">
            <div v-for="loan in completedLoans" :key="loan.id">
              <LoanCard :loan="loan" :total-debt="totalDebt" />
              <button class="btn btn--ghost btn--small reactivate" @click="reactivateLoan(loan.id)">Reopen this loan</button>
            </div>
          </div>
        </section>
      </template>

      <div v-else class="empty">
        <p class="empty__title">No loans</p>
        <p class="empty__subtitle">Add a loan to track what is left and when each EMI is due.</p>
        <button type="button" class="btn btn--primary" @click="showSheet = true">Add a loan</button>
      </div>
    </q-pull-to-refresh>

    <AddLoanSheet v-model="showSheet" />
    <EditLoanSheet v-model="showEditSheet" :loan="editingLoan" />
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { format, parseISO, addMonths } from 'date-fns'
import { useFinanceStore } from '../stores/financeStore'
import { useAccountsStore } from '../stores/accountsStore'
import { showToast } from '../utils/toast'
import { formatMoney, getBudgetMonth } from '../utils/format'
import { useCloudSync } from '../composables/useCloudSync'

import PageHead from '../components/layout/PageHead.vue'
import LoanCard from '../components/loans/LoanCard.vue'
import AddLoanSheet from '../components/loans/AddLoanSheet.vue'
import EditLoanSheet from '../components/loans/EditLoanSheet.vue'

const financeStore = useFinanceStore()
const accounts = useAccountsStore()
const $q = useQuasar()

const showSheet = ref(false)
const showCompleted = ref(false)
const showEditSheet = ref(false)
const editingLoan = ref(null)
const activeLender = ref(null)

function onEditLoan(loan) {
  editingLoan.value = loan
  showEditSheet.value = true
}

async function onCompleteLoan(id) {
  const loan = financeStore.loans.find(l => l.id === id)
  if (!loan) return

  const emiName = `${loan.name} EMI`
  const pendingEMIs = financeStore.expenses.filter(e =>
    ((e.loanId && e.loanId === id) || (e.name === emiName && e.category === 'loans')) && e.status !== 'paid'
  )
  for (const e of pendingEMIs) {
    await financeStore.markAsPaid(e.id)
  }

  await financeStore.updateLoan(id, { status: 'completed', monthsPaid: loan.totalMonths })
  showToast('Loan completed')
}

function handlePayoff(loanId) {
  const loan = financeStore.loans.find(l => l.id === loanId)
  if (!loan) return
  const name = loan.name.trim()
  const emiName = `${loan.name} EMI`
  const ofLoan = e => e.category === 'loans' && (e.loanId === loanId || e.name === emiName)
  const emis = financeStore.expenses.filter(e => ofLoan(e) && e.isInstallment)
  const paidSum = emis.filter(e => e.status === 'paid').reduce((s, e) => s + (e.amount || 0), 0)
  const payoffSum = financeStore.expenses
    .filter(e => ofLoan(e) && !e.isInstallment && e.status === 'paid')
    .reduce((s, e) => s + (e.amount || 0), 0)
  const left = typeof loan.outstandingBalance === 'number'
    ? loan.outstandingBalance
    : (loan.totalAmount || 0) - paidSum - payoffSum
  const owed = Math.max(0, Math.round(left * 100) / 100)

  const items = accounts.tracking
    ? ['lkr', 'cash'].flatMap(w => accounts.accountsIn(w)).map(a => ({ label: a.name, value: `acct:${a.id}` }))
    : []
  const fallback = accounts.tracking ? accounts.defaultSource({ accountsOnly: true }) : null
  $q.dialog({
    title: `Pay off ${name}?`,
    message: owed > 0
      ? `LKR ${formatMoney(owed)} is still owed. It is recorded as paid today${items.length ? ' from the account you pick' : ''}, and the EMIs still to come are removed. Paid EMIs stay.`
      : 'Nothing is owed on this loan. It moves to Paid off and the EMIs still to come are removed.',
    options: items.length && owed > 0 ? { type: 'radio', model: items.some(i => i.value === fallback) ? fallback : items[0].value, items } : undefined,
    cancel: { label: 'Keep', flat: true, color: 'dark' },
    ok: { label: 'Pay off', unelevated: true, color: 'dark' }
  }).onOk(source => {
    const today = format(new Date(), 'yyyy-MM-dd')
    if (owed > 0) {
      financeStore.addExpense({
        name: `${name}, paid off`,
        amount: owed,
        category: 'loans',
        icon: 'account_balance',
        iconColor: '#C0C1FF',
        dueDate: today,
        monthYear: getBudgetMonth(today),
        status: 'paid',
        isRecurring: false,
        isInstallment: false,
        loanId,
        ...(typeof source === 'string' ? accounts.applySource(source) : {})
      })
    }
    const pendingIds = new Set(emis.filter(e => e.status !== 'paid').map(e => e.id))
    financeStore.expenses = financeStore.expenses.filter(e => !pendingIds.has(e.id))
    financeStore.updateLoan(loanId, {
      outstandingBalance: 0,
      totalRepaid: loan.totalAmount || Math.round((paidSum + payoffSum + owed) * 100) / 100,
      status: 'completed'
    })
    syncNow()
    showToast(owed > 0 ? `${name} paid off, LKR ${formatMoney(owed)}` : `${name} moved to Paid off`)
  })
}

function onDeleteLoan(id) {
  const loan = financeStore.loans.find(l => l.id === id)
  if (loan) {
    // Remove all pending EMI expenses for this loan, keep paid history
    const loanName = loan.name
    financeStore.expenses = financeStore.expenses.filter(e => {
      if (e.status === 'paid') return true
      if ((e.loanId && e.loanId === id) || ((e.name === loanName + ' EMI' || e.name === loanName) && e.isInstallment)) {
        return false
      }
      return true
    })
  }
  financeStore.deleteLoan(id)
  financeStore.removeLoanDisbursement(id)
  showToast('Loan deleted', 'delete')
}

async function reactivateLoan(id) {
  const loan = financeStore.loans.find(l => l.id === id)
  if (!loan) return

  // Reset repayment counters so user can pay it down again from scratch.
  // We treat reactivation as "resurrect this loan's obligations" — restore
  // outstandingBalance from totalAmount minus what's still recorded as paid
  // in the expense ledger (paid EMI rows + standalone payoff rows).
  const paidEMIs = financeStore.expenses
    .filter(e => e.loanId === id && e.category === 'loans' &&
                 e.isInstallment && e.status === 'paid')
    .reduce((s, e) => s + (e.amount || 0), 0)
  const paidPayoffs = financeStore.expenses
    .filter(e => e.loanId === id && e.category === 'loans' &&
                 !e.isInstallment && e.status === 'paid')
    .reduce((s, e) => s + (e.amount || 0), 0)
  const restoredRepaid = paidEMIs + paidPayoffs
  const restoredBalance = Math.max(0, (loan.totalAmount || 0) - restoredRepaid)

  // Regenerate any missing pending EMI rows that were deleted during the
  // earlier completion (Check 21 cleanup or handlePayoff filter).
  const existingEMIs = financeStore.expenses.filter(e =>
    e.loanId === id && e.category === 'loans' && e.isInstallment
  )
  const existingByPosition = new Set(existingEMIs.map(e => e.installmentCurrent))
  const totalMonths = loan.totalMonths || 0
  const monthlyInstallment = loan.monthlyInstallment || 0
  const groupId = existingEMIs[0]?.installmentGroupId ||
                  Date.now().toString(36) + Math.random().toString(36).substr(2, 5)

  if (loan.nextDueDate && monthlyInstallment > 0 && totalMonths > 0) {
    const firstPayment = parseISO(loan.nextDueDate)
    for (let i = 0; i < totalMonths; i++) {
      if (existingByPosition.has(i + 1)) continue
      const dueDate = format(addMonths(firstPayment, i), 'yyyy-MM-dd')
      financeStore.addExpense({
        name: `${loan.name} EMI`,
        amount: monthlyInstallment,
        category: 'loans',
        dueDate,
        monthYear: getBudgetMonth(dueDate),
        status: 'pending',
        isRecurring: true,
        isInstallment: true,
        installmentCurrent: i + 1,
        installmentTotal: totalMonths,
        icon: loan.icon || 'account_balance',
        iconColor: '#C0C1FF',
        installmentGroupId: groupId,
        loanId: id
      })
    }
  }

  financeStore.updateLoan(id, {
    status: 'active',
    outstandingBalance: restoredBalance,
    totalRepaid: restoredRepaid
  })
  showToast('Loan reactivated')
}

const { downloadFromCloud, syncNow } = useCloudSync()

async function onRefresh(done) {
  try { await downloadFromCloud() } catch {}
  done()
}

const activeLoans = computed(() =>
  financeStore.loans.filter(l => l.status === 'active')
)

const completedLoans = computed(() =>
  financeStore.loans.filter(l => l.status === 'completed')
)

const totalDebt = computed(() =>
  activeLoans.value.reduce((s, l) => s + loanPending(l), 0)
)

const paidThisMonth = computed(() =>
  financeStore.currentMonthExpenses
    .filter(e => e.category === 'loans' && e.status === 'paid')
    .reduce((s, e) => s + e.amount, 0)
)

const upcomingThisMonth = computed(() =>
  financeStore.currentMonthExpenses
    .filter(e => e.category === 'loans' && e.status !== 'paid')
    .reduce((s, e) => s + e.amount, 0)
)

// Helper: remaining balance for a loan.
// Prefer the explicit outstandingBalance field; fall back to the legacy formula
// for loans that haven't yet been touched by Check 20 or are mid-sync from an
// older client.
function loanPending(loan) {
  if (typeof loan.outstandingBalance === 'number') {
    return Math.max(0, loan.outstandingBalance)
  }
  const paid = (loan.monthlyInstallment || 0) * (loan.monthsPaid || 0)
  return Math.max(0, (loan.totalAmount || 0) - paid)
}

// Group active loans by lender, with total pending amount per lender
const lenderGroups = computed(() => {
  const map = new Map()
  for (const loan of activeLoans.value) {
    const name = (loan.lender || 'Unknown').trim() || 'Unknown'
    if (!map.has(name)) map.set(name, { lender: name, count: 0, pending: 0 })
    const g = map.get(name)
    g.count += 1
    g.pending += loanPending(loan)
  }
  return Array.from(map.values()).sort((a, b) => b.pending - a.pending)
})

const totalPendingAll = computed(() =>
  lenderGroups.value.reduce((s, g) => s + g.pending, 0)
)

const filteredActiveLoans = computed(() => {
  if (!activeLender.value) return activeLoans.value
  return activeLoans.value.filter(l =>
    ((l.lender || 'Unknown').trim() || 'Unknown') === activeLender.value
  )
})

</script>

<style lang="scss" scoped>
.head-count { color: var(--muted); font-weight: 400; margin-left: 4px; }
.lender-chips { margin-bottom: 12px; .num { opacity: 0.8; } }

.done-toggle {
  width: 100%;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--text);
  .material-symbols-outlined { color: var(--muted); }
}

.reactivate { margin: 0 0 8px 8px; }
</style>
