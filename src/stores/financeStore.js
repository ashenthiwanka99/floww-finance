import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { format, parseISO, addMonths, subMonths, getDaysInMonth } from 'date-fns'
import { getBudgetMonth, setSalaryAnchors, getCycleWindow, SALARY_CUTOFF_DAY } from '../utils/format'
import { capacitorStorage } from '../utils/capacitorStorage'
import { validateExpense, validateLoan } from '../utils/validators'
import { useCreditCardStore } from './creditCardStore'
import { useSavingsStore } from './savingsStore'

export const useFinanceStore = defineStore('finance', () => {
  const income = ref({
    salary: 0,
    sideIncome: 0,
    other: []
  })

  const monthlyIncomes = ref({})
  const currencyTransfers = ref([])
  const usdAccount = ref({ openingBalance: 0, openingDate: null })

  function syncSalaryAnchors() {
    setSalaryAnchors(
      Object.entries(monthlyIncomes.value).map(([monthYear, data]) => ({
        monthYear,
        receivedDate: data?.receivedDate
      }))
    )
  }

  watch(monthlyIncomes, syncSalaryAnchors, { deep: true, immediate: true })

  const expenses = ref([])
  const loans = ref([])
  const loanDisbursements = ref([])
  const currentMonth = ref(getBudgetMonth())
  const initialized = ref(false)
  const lastRecurringGenMonth = ref(null)
  const recurringSchedules = ref([])
  const assets = ref([]) // Manual assets: { id, name, type: 'bank'|'cash'|'investment', balance, lastUpdated }
  // One-shot migration flag: anchors `createdAt` on every existing expense
  // to its `dueDate` (local noon). New expenses going forward keep the true
  // Date.now() entry time. See migrateCreatedAtToDueDate() below.
  const _createdAtMigratedToDueDate = ref(false)

  const budgetLimits = ref({
    bills: 15000,
    groceries: 10000,
    dining: 8000,
    subscriptions: 5000,
    transport: 8000,
    personalCare: 12000,
    healthcare: 5000,
    installments: 30000,
    creditCards: 20000,
    loans: 15000
  })

  // Auto-stamp `_updatedAt` whenever any limit value changes so cloud sync
  // can resolve who-wins by timestamp instead of cloud always overwriting.
  // Track previous keys to detect when a non-meta key changed; otherwise the
  // act of stamping _updatedAt would re-trigger the watcher infinitely.
  let _budgetLimitsLastStampedAt = 0
  watch(budgetLimits, () => {
    const now = Date.now()
    if (now - _budgetLimitsLastStampedAt < 50) return  // debounce reentrancy
    _budgetLimitsLastStampedAt = now
    budgetLimits.value._updatedAt = now
  }, { deep: true, flush: 'post' })

  // Base income for a month (salary + side), WITHOUT carryover. The carry-forward
  // loop deliberately uses base only, so a salary-less month inherits a prior
  // month's salary — never a prior month's carryover.
  function transfersForMonth(monthKey) {
    return (currencyTransfers.value || []).filter(t => t?.monthYear === monthKey)
  }

  function lkrMovedForMonth(monthKey) {
    return transfersForMonth(monthKey).reduce((s, t) => s + (Number(t.lkrAmount) || 0), 0)
  }

  function usdMovedForMonth(monthKey) {
    return transfersForMonth(monthKey).reduce((s, t) => s + (Number(t.usdAmount) || 0), 0)
  }

  function usesTransferBudget(monthKey) {
    return monthlyIncomes.value[monthKey]?.budgetSource === 'transfers'
  }

  function baseIncomeForMonth(monthKey) {
    const mi = monthlyIncomes.value[monthKey]

    if (mi?.budgetSource === 'transfers') {
      return lkrMovedForMonth(monthKey) + (mi.sideIncome || 0)
    }

    // 1. Check exact month
    if (mi) {
      const total = mi.total || ((mi.lkrSalary || 0) + (mi.sideIncome || 0))
      if (total > 0) return total
    }

    // 2. Carry forward from most recent past month
    const [y2, m2] = monthKey.split('-').map(Number)
    const allMonthKeys = Object.keys(monthlyIncomes.value)
      .filter(m => {
        const [y1, m1] = m.split('-').map(Number)
        return y1 < y2 || (y1 === y2 && m1 < m2)
      })
      .sort()
    for (let i = allMonthKeys.length - 1; i >= 0; i--) {
      const key = allMonthKeys[i]
      const prev = monthlyIncomes.value[key]
      if (prev.budgetSource === 'transfers') continue
      const prevTotal = prev.total || ((prev.lkrSalary || 0) + (prev.sideIncome || 0))
      if (prevTotal > 0) return prevTotal
    }

    // 3. Fallback to legacy income ref
    const legacy = (income.value.salary || 0) + (income.value.sideIncome || 0)
    return legacy
  }

  // Total income for a month = base salary/side + any leftover carried in from
  // the previous month (snapshot stored on the month's income object).
  function hasRecordedIncome(monthKey) {
    const mi = monthlyIncomes.value[monthKey]
    if (!mi) return false
    if (mi.budgetSource === 'transfers') return true
    const total = mi.total || ((mi.lkrSalary || 0) + (mi.sideIncome || 0))
    return total > 0
  }

  function getIncomeForMonth(monthKey) {
    const carry = monthlyIncomes.value[monthKey]?.carryover || 0
    return baseIncomeForMonth(monthKey) + carry
  }

  const totalIncome = computed(() => getIncomeForMonth(currentMonth.value))

  const currentMonthExpenses = computed(() =>
    expenses.value.filter(e => e.monthYear === currentMonth.value)
  )

  const excludedFromSpending = ['savings', 'cashWithdrawal', 'lend', 'loans', 'creditCardPayment']

  const totalSpent = computed(() =>
    currentMonthExpenses.value
      .filter(e => !excludedFromSpending.includes(e.category) && e.status === 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )

  const totalPending = computed(() =>
    currentMonthExpenses.value
      .filter(e => !excludedFromSpending.includes(e.category) && e.status !== 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )

  const totalSavedThisMonth = computed(() =>
    currentMonthExpenses.value
      .filter(e => e.category === 'savings' && e.status === 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )

  const totalLentThisMonth = computed(() =>
    currentMonthExpenses.value
      .filter(e => e.category === 'lend' && e.status === 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )

  // Loan disbursements are NOT income — they're cash with a matching liability.
  // Kept as a display-only stat for the loans banner / monthly report.
  const currentMonthLoanReceived = computed(() =>
    (loanDisbursements.value || [])
      .filter(d => d?.monthYear === currentMonth.value)
      .reduce((s, d) => s + (d?.amount || 0), 0)
  )

  // Debt repayments (category: 'loans') are transfers, not expenses.
  // Surfaced as separate stats so the user can still see debt activity.
  // Includes loan EMIs AND credit card payments — both are transfers that
  // reduce a liability (and reduce bank balance) without being consumption.
  const currentMonthDebtRepaid = computed(() =>
    currentMonthExpenses.value
      .filter(e => (e.category === 'loans' || e.category === 'creditCardPayment') && e.status === 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )
  const currentMonthDebtPending = computed(() =>
    currentMonthExpenses.value
      .filter(e => (e.category === 'loans' || e.category === 'creditCardPayment') && e.status !== 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )

  // Loan disbursements DO land in the bank, so they're cash you can spend this
  // month — but the matching liability is tracked separately on the loan record,
  // not as recurring income. The repayment side is handled via currentMonthDebtRepaid.
  const totalAvailable = computed(() =>
    totalIncome.value + currentMonthLoanReceived.value
  )

  const remaining = computed(() =>
    totalAvailable.value - totalSpent.value - totalSavedThisMonth.value - totalLentThisMonth.value - currentMonthDebtRepaid.value
  )

  const budgetUtilization = computed(() =>
    totalIncome.value > 0
      ? Math.max(0, Math.min(100, Math.round((totalSpent.value / totalIncome.value) * 100)))
      : 0
  )

  const remainingFromIncome = computed(() =>
    totalIncome.value - totalSpent.value - totalSavedThisMonth.value - totalLentThisMonth.value - currentMonthDebtRepaid.value
  )

  const savingsRate = computed(() =>
    totalIncome.value > 0
      ? Math.max(0, Math.min(100, Math.round((remainingFromIncome.value / totalIncome.value) * 100)))
      : 0
  )

  const expensesByCategory = computed(() => {
    const cats = {}
    currentMonthExpenses.value.forEach(e => {
      if (!cats[e.category]) cats[e.category] = 0
      cats[e.category] += e.amount
    })
    return cats
  })

  const fixedExpenses = computed(() =>
    currentMonthExpenses.value
      .filter(e => e.isRecurring)
      .reduce((s, e) => s + e.amount, 0)
  )

  const variableExpenses = computed(() =>
    currentMonthExpenses.value
      .filter(e => !e.isRecurring && !e.isInstallment)
      .reduce((s, e) => s + e.amount, 0)
  )

  const installmentExpenses = computed(() =>
    currentMonthExpenses.value
      .filter(e => e.isInstallment)
      .reduce((s, e) => s + e.amount, 0)
  )

  const activeLoans = computed(() =>
    loans.value.filter(l => l.status === 'active')
  )

  const totalLoanDebt = computed(() =>
    activeLoans.value.reduce((s, l) => {
      const rem = typeof l.outstandingBalance === 'number'
        ? l.outstandingBalance
        : Math.max(0, (l.totalAmount || 0) - ((l.monthlyInstallment || 0) * (l.monthsPaid || 0)))
      return s + Math.max(0, rem)
    }, 0)
  )

  // ── Cash on Hand ──
  const cashOnHand = computed(() =>
    (assets.value || [])
      .filter(a => a.type === 'cash')
      .reduce((s, a) => s + (a.balance || 0), 0)
  )

  const bankBalance = computed(() =>
    (assets.value || [])
      .filter(a => a.type === 'bank')
      .reduce((s, a) => s + (a.balance || 0), 0)
  )

  const totalCashWithdrawnThisMonth = computed(() =>
    currentMonthExpenses.value
      .filter(e => e.category === 'cashWithdrawal' && e.status === 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )

  // Card-paid expenses don't leave the bank — they accrue on the card's outstanding
  // (tracked separately by creditCardStore). They're still in `totalSpent` for
  // category analytics / budget utilization, so we add them back here.
  const currentMonthCardCharged = computed(() =>
    currentMonthExpenses.value
      .filter(e => e.paidByCardId && e.status === 'paid')
      .reduce((s, e) => s + e.amount, 0)
  )

  // Auto-calculated remaining bank balance for current month.
  // Start from `remaining` (income + loans − spending − savings − lent − debt repay),
  // subtract cash on hand (paidFromCash items reduce `cashOnHand` which cancels their
  // hit on `remaining`), and add back card charges (which never touched the bank).
  const monthlyBankRemaining = computed(() => {
    return Math.max(0, remaining.value - cashOnHand.value + currentMonthCardCharged.value)
  })

  // "Clear" balance shown as the hero number: what's actually yours this month.
  // Card-paid expenses are NOT deducted here — the user pays the card bill from
  // *next* month's budget (statement due ~27th), so card spend shouldn't shrink
  // this month's spendable. `remaining` still counts it (savings rate / health /
  // budget-used keep treating card as spent); this view just adds it back.
  // Identity: monthlyClearBalance === monthlyBankRemaining + cashOnHand
  // (i.e. Bank + Cash), with the card balance shown separately as a standing liability.
  const monthlyClearBalance = computed(() =>
    remaining.value + currentMonthCardCharged.value
  )

  function getOrCreateCashAsset() {
    // If duplicate cash assets ever exist (cloud sync race or manual data
    // corruption), collapse them into the first one and remove the rest.
    // Otherwise subsequent cash sync only hits the first asset and the
    // duplicates drift silently.
    const cashAssets = assets.value.filter(a => a.type === 'cash')
    if (cashAssets.length > 1) {
      const primary = cashAssets[0]
      let merged = primary.balance || 0
      for (let i = 1; i < cashAssets.length; i++) {
        merged += cashAssets[i].balance || 0
      }
      primary.balance = merged
      primary.lastUpdated = Date.now()
      const dupIds = new Set(cashAssets.slice(1).map(a => a.id))
      assets.value = assets.value.filter(a => !dupIds.has(a.id))
      return primary
    }
    if (cashAssets.length === 1) return cashAssets[0]
    const cashAsset = { id: uuidv4(), name: 'Cash on Hand', type: 'cash', balance: 0, lastUpdated: Date.now() }
    assets.value.push(cashAsset)
    return cashAsset
  }

  let defaultPaySource = null

  function setDefaultPaySource(fn) {
    defaultPaySource = typeof fn === 'function' ? fn : null
  }

  function ensureSource(e) {
    if (!defaultPaySource || !e || e.refund || e.paidByCardId || e.accountId || e.paidFromCash) return
    const src = defaultPaySource()
    if (!src?.accountId) return
    e.accountId = src.accountId
    if (src.paidFromCash) e.paidFromCash = true
  }

  function addExpense(expense) {
    try {
      const validation = validateExpense(expense)
      if (!validation.valid) return { success: false, errors: validation.errors }
      const status = expense.status || 'pending'
      if (status === 'paid') ensureSource(expense)
      expenses.value.push({
        ...expense,
        id: uuidv4(),
        status,
        monthYear: expense.monthYear || (expense.dueDate ? getBudgetMonth(expense.dueDate) : currentMonth.value),
        createdAt: Date.now(),
        updatedAt: Date.now()
      })

      // Cash asset sync (mutually exclusive: cashWithdrawal adds to cash, paidFromCash deducts)
      if (expense.category === 'cashWithdrawal' && status === 'paid') {
        const cashAsset = getOrCreateCashAsset()
        cashAsset.balance += expense.amount
        cashAsset.lastUpdated = Date.now()
      } else if (expense.paidFromCash && status === 'paid') {
        const cashAsset = getOrCreateCashAsset()
        cashAsset.balance -= expense.amount
        cashAsset.lastUpdated = Date.now()
      }

      // Credit card sync:
      // - paidByCardId on a regular expense → adds to that card's outstanding (charge)
      // - category 'creditCardPayment' → reduces card outstanding (payment toward balance)
      if (status === 'paid') {
        if (expense.category === 'creditCardPayment' && expense.cardId) {
          syncCardPayment(expense.cardId, expense.amount, 'apply')
        } else if (expense.paidByCardId && !expense.paidFromCash && expense.category !== 'cashWithdrawal') {
          syncCardCharge(expense.paidByCardId, expense.amount, 'apply')
        }
      }

      refreshNotifications()
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] addExpense failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  // Helper: sync a card charge (regular expense paid by card) — apply or reverse.
  // Synchronous so reverse-then-apply ordering in updateExpense is deterministic
  // (creditCardStore does not import financeStore, so no circular dep).
  function syncCardCharge(cardId, amount, direction) {
    if (!cardId || !amount) return
    try {
      const cardStore = useCreditCardStore()
      if (direction === 'apply') cardStore.applyCharge(cardId, amount)
      else cardStore.reverseCharge(cardId, amount)
    } catch (err) {
      console.error('[FLOWW] syncCardCharge failed:', err?.message || 'Unknown error')
    }
  }

  // Helper: sync a card payment (paying toward balance) — apply or reverse
  function syncCardPayment(cardId, amount, direction) {
    if (!cardId || !amount) return
    try {
      const cardStore = useCreditCardStore()
      if (direction === 'apply') cardStore.applyPayment(cardId, amount)
      else cardStore.reversePayment(cardId, amount)
    } catch (err) {
      console.error('[FLOWW] syncCardPayment failed:', err?.message || 'Unknown error')
    }
  }

  const _markingPaid = new Set()

  async function markAsPaid(id) {
    try {
      // Guard against rapid double-taps on the same expense
      if (_markingPaid.has(id)) return
      _markingPaid.add(id)

      const e = expenses.value.find(e => e.id === id)
      if (!e) { _markingPaid.delete(id); return }

      const oldStatus = e.status
      if (oldStatus === 'paid') { _markingPaid.delete(id); return }

      ensureSource(e)
      e.status = 'paid'
      e.paidAt = Date.now()
      e.updatedAt = Date.now()

      // Sync cash asset when marking paid (mutually exclusive). No clamp so the
      // reverse (un-pay/delete) is an exact inverse and cash is never invented.
      if (e.category === 'cashWithdrawal') {
        const cashAsset = getOrCreateCashAsset()
        cashAsset.balance += e.amount
        cashAsset.lastUpdated = Date.now()
      } else if (e.paidFromCash) {
        const cashAsset = getOrCreateCashAsset()
        cashAsset.balance -= e.amount
        cashAsset.lastUpdated = Date.now()
      }

      // Sync credit card on mark-paid:
      // - creditCardPayment expense → reduce card outstanding
      // - paidByCardId on regular expense → add to card outstanding
      if (e.category === 'creditCardPayment' && e.cardId) {
        syncCardPayment(e.cardId, e.amount, 'apply')
      } else if (e.paidByCardId && !e.paidFromCash && e.category !== 'cashWithdrawal') {
        syncCardCharge(e.paidByCardId, e.amount, 'apply')
      }

      // Sync loan monthsPaid + outstandingBalance if this is a loan EMI
      if (e.category === 'loans' && e.isInstallment) {
        const loan = findLoanForExpense(e)
        if (loan) {
          if (loan.totalMonths && (loan.monthsPaid || 0) < loan.totalMonths) {
            loan.monthsPaid = (loan.monthsPaid || 0) + 1
          }
          loan.totalRepaid = (loan.totalRepaid || 0) + e.amount
          const baseBalance = typeof loan.outstandingBalance === 'number'
            ? loan.outstandingBalance
            : (loan.totalAmount || 0)
          loan.outstandingBalance = Math.max(0, baseBalance - e.amount)
          if (loan.outstandingBalance === 0 && loan.status === 'active') {
            loan.status = 'completed'
          }
          loan.updatedAt = Date.now()
          // Re-derive from paid rows and re-amortize the remaining schedule.
          reamortizeLoan(loan.id)
        }
      }

      // Sync savings when savings expense is marked paid
      if (e.category === 'savings' && e.savingsGoalId) {
        try {
          const r = useSavingsStore().addFunds(e.savingsGoalId, e.amount)
          if (r?.depositId) e.depositId = r.depositId
        } catch {}
      }

      refreshNotifications()
    } catch (err) {
      console.error('[FLOWW] markAsPaid failed:', err?.message || 'Unknown error')
    } finally {
      _markingPaid.delete(id)
    }
  }

  // Find the loan associated with an EMI expense (by loanId or name fallback)
  function findLoanForExpense(e) {
    let loan = e.loanId ? loans.value.find(l => l.id === e.loanId) : null
    if (!loan) {
      const loanName = e.name.replace(/\s+EMI$/, '')
      // Match by name + lender to avoid collisions with same-named loans
      const candidates = loans.value.filter(l => l.name === loanName)
      loan = candidates.length === 1 ? candidates[0] : null
      if (loan) e.loanId = loan.id  // backfill
    }
    return loan
  }

  // Re-schedule notifications after data changes
  function refreshNotifications() {
    try {
      import('../composables/useNotifications').then(mod => {
        mod.scheduleAllNotifications()
      }).catch(() => {})
    } catch {}
  }

  async function updateExpense(id, updates) {
    try {
      const idx = expenses.value.findIndex(e => e.id === id)
      if (idx === -1) return { success: false, errors: ['Expense not found'] }

      // Validate amount if being updated
      if (updates.amount !== undefined && (typeof updates.amount !== 'number' || updates.amount <= 0 || isNaN(updates.amount))) {
        return { success: false, errors: ['Amount must be greater than 0'] }
      }

      const old = expenses.value[idx]
      const newStatus = updates.status ?? old.status
      const newAmount = updates.amount ?? old.amount
      const newCategory = updates.category ?? old.category
      const newPaidFromCash = updates.paidFromCash ?? old.paidFromCash

      const wasPaid = old.status === 'paid'
      const willBePaid = newStatus === 'paid'
      if (willBePaid && !wasPaid && updates.paidAt === undefined) updates.paidAt = Date.now()
      if (!willBePaid && wasPaid) updates.paidAt = undefined

      // ── Step 1: Reverse OLD sync effects if was paid ──
      if (wasPaid) {
        // Reverse loan monthsPaid + outstandingBalance
        if (old.category === 'loans' && old.isInstallment) {
          const loan = findLoanForExpense(old)
          if (loan) {
            if ((loan.monthsPaid || 0) > 0) {
              loan.monthsPaid = loan.monthsPaid - 1
            }
            loan.totalRepaid = Math.max(0, (loan.totalRepaid || 0) - old.amount)
            const baseBalance = typeof loan.outstandingBalance === 'number'
              ? loan.outstandingBalance
              : 0
            loan.outstandingBalance = Math.min(loan.totalAmount || 0, baseBalance + old.amount)
            // If we restored balance, loan is no longer fully completed
            if (loan.outstandingBalance > 0 && loan.status === 'completed') {
              loan.status = 'active'
            }
            loan.updatedAt = Date.now()
          }
        }
        // Reverse savings
        if (old.category === 'savings' && old.savingsGoalId) {
          try {
            useSavingsStore().removeFunds(old.savingsGoalId, old.amount, old.depositId)
          } catch {}
        }
        // Reverse cash (mutually exclusive). No clamp: apply/reverse must be exact
        // inverses so editing/un-paying never invents or destroys cash.
        if (old.category === 'cashWithdrawal') {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance -= old.amount
          cashAsset.lastUpdated = Date.now()
        } else if (old.paidFromCash) {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance += old.amount
          cashAsset.lastUpdated = Date.now()
        }
        // Reverse credit card sync
        if (old.category === 'creditCardPayment' && old.cardId) {
          syncCardPayment(old.cardId, old.amount, 'reverse')
        } else if (old.paidByCardId) {
          syncCardCharge(old.paidByCardId, old.amount, 'reverse')
        }
      }

      // ── Step 2: Apply NEW sync effects if will be paid ──
      if (willBePaid) {
        // Sync loan monthsPaid + outstandingBalance
        if (newCategory === 'loans' && (updates.isInstallment ?? old.isInstallment)) {
          const tempExpense = { ...old, ...updates }
          const loan = findLoanForExpense(tempExpense)
          if (loan) {
            if (loan.totalMonths && (loan.monthsPaid || 0) < loan.totalMonths) {
              loan.monthsPaid = (loan.monthsPaid || 0) + 1
            }
            loan.totalRepaid = (loan.totalRepaid || 0) + newAmount
            const baseBalance = typeof loan.outstandingBalance === 'number'
              ? loan.outstandingBalance
              : (loan.totalAmount || 0)
            loan.outstandingBalance = Math.max(0, baseBalance - newAmount)
            if (loan.outstandingBalance === 0 && loan.status === 'active') {
              loan.status = 'completed'
            }
            loan.updatedAt = Date.now()
          }
        }
        // Sync savings (mirror of the Step-1 reverse — without this, editing a
        // paid savings deposit would strip the goal's funds and never restore them)
        const newGoalId = updates.savingsGoalId ?? old.savingsGoalId
        if (newCategory === 'savings' && newGoalId) {
          try {
            const r = useSavingsStore().addFunds(newGoalId, newAmount)
            updates.depositId = r?.depositId || null
          } catch {}
        }
        // Sync cash (mutually exclusive). No clamp — exact inverse of the reverse above.
        if (newCategory === 'cashWithdrawal') {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance += newAmount
          cashAsset.lastUpdated = Date.now()
        } else if (newPaidFromCash) {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance -= newAmount
          cashAsset.lastUpdated = Date.now()
        }
        // Apply credit card sync
        const newCardId = updates.cardId ?? old.cardId
        const newPaidByCardId = updates.paidByCardId ?? old.paidByCardId
        if (newCategory === 'creditCardPayment' && newCardId) {
          syncCardPayment(newCardId, newAmount, 'apply')
        } else if (newPaidByCardId && !newPaidFromCash && newCategory !== 'cashWithdrawal') {
          syncCardCharge(newPaidByCardId, newAmount, 'apply')
        }
      }

      expenses.value[idx] = { ...old, ...updates, id: old.id, createdAt: old.createdAt, updatedAt: Date.now() }
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] updateExpense failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function deleteExpense(id) {
    try {
      const e = expenses.value.find(e => e.id === id)
      // Capture the loan link before removal so the schedule can be re-derived after.
      let loanIdToFix = null
      if (e && e.category === 'loans' && e.isInstallment) {
        loanIdToFix = findLoanForExpense(e)?.id || null
      }
      if (e && e.status === 'paid') {
        // Reverse cash sync (mutually exclusive). No clamp — exact inverse of apply.
        if (e.category === 'cashWithdrawal') {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance -= e.amount
          cashAsset.lastUpdated = Date.now()
        } else if (e.paidFromCash) {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance += e.amount
          cashAsset.lastUpdated = Date.now()
        }
        // Reverse credit card sync
        if (e.category === 'creditCardPayment' && e.cardId) {
          syncCardPayment(e.cardId, e.amount, 'reverse')
        } else if (e.paidByCardId) {
          syncCardCharge(e.paidByCardId, e.amount, 'reverse')
        }
        // Reverse savings (was previously not reversed → goal stayed inflated)
        if (e.category === 'savings' && e.savingsGoalId) {
          try {
            useSavingsStore().removeFunds(e.savingsGoalId, e.amount, e.depositId)
          } catch {}
        }
      }
      expenses.value = expenses.value.filter(e => e.id !== id)
      // Re-derive loan totals + rebuild the EMI schedule from the remaining rows.
      // Runs for paid AND pending EMI deletes so the schedule stays consistent
      // with outstandingBalance (it never silently drifts).
      if (loanIdToFix) reamortizeLoan(loanIdToFix)
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] deleteExpense failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function cancelRecurring(identifier) {
    try {
      // Find schedule by name or id
      const schedule = recurringSchedules.value.find(s =>
        s.id === identifier || s.name === identifier
      )
      if (schedule) {
        return stopSchedule(schedule.id)
      }
      // Fallback for legacy data without scheduleId
      expenses.value = expenses.value.filter(e => {
        if (e.status === 'paid') return true
        if (e.recurringGroupName === identifier && e.isRecurring) return false
        if (e.name === identifier && e.isRecurring && !e.isInstallment) return false
        return true
      })
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function addSchedule(schedule) {
    try {
      const id = uuidv4()
      recurringSchedules.value.push({
        ...schedule,
        id,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      return { success: true, id }
    } catch (err) {
      return { success: false }
    }
  }

  function stopSchedule(scheduleId) {
    try {
      const s = recurringSchedules.value.find(s => s.id === scheduleId)
      if (s) {
        s.active = false
        s.updatedAt = Date.now()
      }
      // Also remove future unpaid expenses for this schedule
      expenses.value = expenses.value.filter(e => {
        if (e.scheduleId === scheduleId && e.status !== 'paid') return false
        return true
      })
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function updateSchedule(scheduleId, updates) {
    try {
      const s = recurringSchedules.value.find(s => s.id === scheduleId)
      if (!s) return { success: false }
      Object.assign(s, updates, { updatedAt: Date.now() })

      // Sync future UNPAID expenses tied to this schedule
      // (only amount, name, category, icon — date shifts are too risky to auto-apply)
      expenses.value.forEach(e => {
        if (e.scheduleId === scheduleId && e.status !== 'paid') {
          if (updates.amount !== undefined) e.amount = updates.amount
          if (updates.name !== undefined) e.name = updates.name
          if (updates.category !== undefined) e.category = updates.category
          if (updates.icon !== undefined) e.icon = updates.icon
          if (updates.iconColor !== undefined) e.iconColor = updates.iconColor
          if (updates.accountId !== undefined) e.accountId = updates.accountId || undefined
          if (updates.paidByCardId !== undefined) e.paidByCardId = updates.paidByCardId || undefined
          if (updates.paidFromCash !== undefined) e.paidFromCash = updates.paidFromCash || undefined
          if (updates.via !== undefined) e.via = updates.via || undefined
          e.updatedAt = Date.now()
        }
      })
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function deleteSchedule(scheduleId) {
    try {
      stopSchedule(scheduleId) // removes future expenses
      recurringSchedules.value = recurringSchedules.value.filter(s => s.id !== scheduleId)
      return { success: true }
    } catch (err) {
      return { success: false }
    }
  }

  function navigateMonth(direction) {
    const [y, m] = currentMonth.value.split('-').map(Number)
    const d = addMonths(new Date(y, m - 1), direction)
    const newMonth = format(d, 'yyyy-MM')
    currentMonth.value = newMonth
    ensureRecurringForMonth(newMonth)
  }

  // Jump to a specific month (from month picker) — fills gaps in between
  function jumpToMonth(targetMonth) {
    const oldMonth = currentMonth.value
    currentMonth.value = targetMonth

    // Fill any gaps between old and target month with recurring expenses
    const [oy, om] = oldMonth.split('-').map(Number)
    const [ty, tm] = targetMonth.split('-').map(Number)
    const oldDate = new Date(oy, om - 1)
    const targetDate = new Date(ty, tm - 1)

    if (targetDate > oldDate) {
      // Moving forward — generate for each month in between
      let d = addMonths(oldDate, 1)
      while (d <= targetDate) {
        const monthKey = format(d, 'yyyy-MM')
        generateRecurringExpenses(monthKey)
        d = addMonths(d, 1)
      }
    } else {
      // Moving backward — just generate for target month
      ensureRecurringForMonth(targetMonth)
    }
  }

  // Generate recurring expenses only when needed (no watch — prevents duplicates)
  function ensureRecurringForMonth(targetMonth) {
    // Always call generateRecurringExpenses — it has internal Set-based dedup
    // that prevents adding entries that already exist for this month
    generateRecurringExpenses(targetMonth)
  }

  function addLoan(loan) {
    try {
      const validation = validateLoan(loan)
      if (!validation.valid) return { success: false, errors: validation.errors }
      const id = uuidv4()
      // Seed liability fields. If user creates a loan with prior monthsPaid > 0,
      // those pre-existing payments are reflected up front so we don't double-count
      // when the corresponding paid EMI rows are created (which DON'T trigger
      // markAsPaid sync because they're added with status 'paid' from the start).
      const seedRepaid = (loan.monthlyInstallment || 0) * (loan.monthsPaid || 0)
      const seedBalance = Math.max(0, (loan.totalAmount || 0) - seedRepaid)
      loans.value.push({
        ...loan,
        id,
        outstandingBalance: seedBalance,
        totalRepaid: seedRepaid,
        createdAt: Date.now(),
        updatedAt: Date.now()
      })
      return { success: true, id }
    } catch (err) {
      console.error('[FLOWW] addLoan failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function addLoanDisbursement(data) {
    try {
      loanDisbursements.value.push({
        ...data,
        id: uuidv4(),
        createdAt: Date.now()
      })
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] addLoanDisbursement failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  function removeLoanDisbursement(loanId) {
    loanDisbursements.value = loanDisbursements.value.filter(d => d.loanId !== loanId)
  }

  function updateLoan(id, updates) {
    try {
      const idx = loans.value.findIndex(l => l.id === id)
      if (idx === -1) return { success: false }
      // Basic validation
      if (updates.totalAmount !== undefined && (updates.totalAmount <= 0 || isNaN(updates.totalAmount))) {
        return { success: false, errors: ['Invalid total amount'] }
      }
      if (updates.monthsPaid !== undefined && updates.monthsPaid < 0) {
        updates.monthsPaid = 0
      }
      if (updates.totalMonths !== undefined && updates.totalMonths > 360) {
        updates.totalMonths = 360
      }
      // Clamp monthsPaid to totalMonths
      const finalTotalMonths = updates.totalMonths ?? loans.value[idx].totalMonths
      const finalMonthsPaid = updates.monthsPaid ?? loans.value[idx].monthsPaid
      if (finalMonthsPaid > finalTotalMonths) {
        updates.monthsPaid = finalTotalMonths
      }

      // If totalAmount changes, the outstanding balance must be re-anchored:
      // outstandingBalance = max(0, newTotalAmount - totalRepaid).
      // Without this, an earlier outstandingBalance value lingers and the loan
      // shows a stale liability after the user edits the loan structure.
      // We don't auto-recompute when caller has explicitly passed
      // outstandingBalance in `updates` — that's a deliberate override.
      if (updates.totalAmount !== undefined && updates.outstandingBalance === undefined) {
        const newTotal = updates.totalAmount
        const repaid = updates.totalRepaid ?? loans.value[idx].totalRepaid ?? 0
        updates.outstandingBalance = Math.max(0, newTotal - repaid)
      }

      loans.value[idx] = { ...loans.value[idx], ...updates, createdAt: loans.value[idx].createdAt, updatedAt: Date.now() }
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] updateLoan failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function deleteLoan(id) {
    try {
      removeLoanDisbursement(id)
      // Get the loan BEFORE filtering it out (needed for name-based fallback)
      const loan = loans.value.find(l => l.id === id)
      // Collect ALL EMI expenses (paid and unpaid) to delete via deleteExpense
      // so cash/loan sync is properly reversed
      const toDelete = []
      expenses.value.forEach(e => {
        if (e.loanId === id) {
          toDelete.push(e.id)
        } else if (loan && e.name === `${loan.name} EMI` && e.category === 'loans') {
          // Fallback name-based cleanup for legacy data
          toDelete.push(e.id)
        }
      })
      // Remove the loan FIRST so deleteExpense's reamortize step is a no-op
      // (otherwise rebuilding the tail would re-create EMI rows as we delete them).
      loans.value = loans.value.filter(l => l.id !== id)
      toDelete.forEach(expId => deleteExpense(expId))
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] deleteLoan failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function setMonthlyIncome(monthYear, data) {
    try {
      if (!monthYear || typeof monthYear !== 'string') return { success: false }
      // Validate numeric fields
      const lkrSalary = Number(data.lkrSalary) || 0
      const sideIncome = Number(data.sideIncome) || 0
      const total = Math.round((lkrSalary + sideIncome) * 100) / 100
      // Fix floating point precision
      data.lkrSalary = Math.round(lkrSalary * 100) / 100
      data.sideIncome = Math.round(sideIncome * 100) / 100
      if (data.total) data.total = Math.round(data.total * 100) / 100
      else data.total = total
      // Preserve an existing carryover snapshot if the caller didn't supply one
      // (e.g. editing salary shouldn't wipe the carried-in amount).
      const prev = monthlyIncomes.value[monthYear]
      if (data.carryover === undefined && prev && prev.carryover !== undefined) {
        data.carryover = prev.carryover
        if (data.carryoverFrom === undefined) data.carryoverFrom = prev.carryoverFrom
      }
      if (data.carryover !== undefined) {
        data.carryover = Math.round((Number(data.carryover) || 0) * 100) / 100
      }
      data._updatedAt = Date.now()
      monthlyIncomes.value[monthYear] = data
      syncSalaryAnchors()
    } catch (err) {
      console.error('[FLOWW] setMonthlyIncome failed:', err?.message || 'Unknown error')
    }
  }

  function getMonthIncome(monthYear) {
    return monthlyIncomes.value[monthYear] || null
  }

  // Liquid money left at the end of a given budget month = bank leftover + cash
  // on hand, floored at 0. Month-parametrised mirror of the live computeds.
  //
  // Spending and debt are counted whether paid OR pending: an unpaid bill in
  // the source month is a committed obligation, so it must NOT be rolled
  // forward as spendable income (prevents carryover over-statement when the
  // prior month still has pending recurring bills / EMIs). Savings & lend are
  // discretionary, so only counted once actually actioned (paid). Card charges
  // are added back symmetrically (paid OR pending) since they never debit the
  // bank — you'll settle the card from a later budget.
  function monthLeftover(monthKey) {
    const monthExp = expenses.value.filter(e => e.monthYear === monthKey)
    const sum = (pred) => monthExp.filter(pred).reduce((s, e) => s + (e.amount || 0), 0)

    const incomeP = getIncomeForMonth(monthKey)
    const loansP = (loanDisbursements.value || [])
      .filter(d => d?.monthYear === monthKey)
      .reduce((s, d) => s + (d?.amount || 0), 0)
    const spentP = sum(e => !excludedFromSpending.includes(e.category))
    const savedP = sum(e => e.category === 'savings' && e.status === 'paid')
    const lentP = sum(e => e.category === 'lend' && e.status === 'paid')
    const debtP = sum(e => (e.category === 'loans' || e.category === 'creditCardPayment'))
    const cardP = sum(e => e.paidByCardId)

    const remainingP = incomeP + loansP - spentP - savedP - lentP - debtP
    const bankP = Math.max(0, remainingP - cashOnHand.value + cardP)
    return Math.max(0, Math.round(bankP + cashOnHand.value))
  }

  // One-shot: rewrite every existing expense's `createdAt` to noon-of-dueDate
  // so the "sort by added" UX produces a sensible order for legacy entries
  // (which all stamped Date.now() at insert, regardless of the actual purchase
  // date). New expenses created after this flag is set retain their true
  // Date.now() stamps, so backdated future entries can still pop to the top
  // of "Added" mode. Idempotent — the flag is persisted via Pinia.
  function migrateCreatedAtToDueDate() {
    if (_createdAtMigratedToDueDate.value) return 0
    let touched = 0
    for (const e of expenses.value) {
      if (!e.dueDate) continue
      try {
        const d = parseISO(e.dueDate)
        // Local noon so two entries from the same calendar day share a key
        // (stable sort then preserves array order) instead of inheriting the
        // millisecond drift from the original Date.now() stamps.
        d.setHours(12, 0, 0, 0)
        e.createdAt = d.getTime()
        touched++
      } catch {}
    }
    _createdAtMigratedToDueDate.value = true
    return touched
  }

  // Best-effort one-shot: stamp `sourceSmsFingerprint` onto pre-existing
  // SMS-imported expenses by matching their `notes` body-prefix against the
  // legacy `importedFingerprints` cache from smsImport. Idempotent — skips
  // expenses that already have the field, and no-ops when the cache is empty.
  //
  // Why: the legacy smsImport store relies on Capacitor Preferences which
  // doesn't always flush before app close, so imported markers were vanishing
  // on restart. New imports stamp the fingerprint directly on the expense;
  // this backfill rescues the user's existing import history while it's still
  // sitting in memory (smsImport hasn't been wiped yet on this boot).
  function backfillSmsFingerprints(fingerprints) {
    try {
      if (!Array.isArray(fingerprints) || fingerprints.length === 0) return 0
      const bodyHashToFp = new Map()
      for (const fp of fingerprints) {
        if (typeof fp !== 'string') continue
        const parts = fp.split('|')
        const bodyHash = parts[4] || ''
        if (bodyHash && !bodyHashToFp.has(bodyHash)) {
          bodyHashToFp.set(bodyHash, fp)
        }
      }
      if (bodyHashToFp.size === 0) return 0

      let stamped = 0
      for (const e of expenses.value) {
        if (e.sourceSmsFingerprint) continue
        const notes = e.notes
        if (typeof notes !== 'string') continue
        const m = /^\[SMS\]\s*/.exec(notes)
        if (!m) continue
        const body = notes.slice(m[0].length)
        const bodyHash = body.slice(0, 24).replace(/\s+/g, '')
        const fp = bodyHashToFp.get(bodyHash)
        if (fp) {
          e.sourceSmsFingerprint = fp
          e.updatedAt = Date.now()
          stamped++
        }
      }
      return stamped
    } catch (err) {
      console.error('[FLOWW] backfillSmsFingerprints failed:', err?.message || 'Unknown error')
      return 0
    }
  }

  // Auto-carryover is disabled: prev-month leftover never rolls forward
  // automatically. `carryover` on a monthlyIncomes entry is purely manual now
  // — the user types it in via the Monthly Income page.
  //
  // Strip any auto-set carryovers from older data. We can tell them apart from
  // manual ones because the auto-setter wrote a `carryoverFrom` reference;
  // manual saves leave it null. Runs idempotently — after first run there's
  // nothing left with `carryoverFrom`, so subsequent calls are no-ops.
  function purgeAutoCarryovers() {
    try {
      for (const key of Object.keys(monthlyIncomes.value)) {
        const entry = monthlyIncomes.value[key]
        if (entry && entry.carryoverFrom) {
          delete entry.carryover
          delete entry.carryoverFrom
          entry._updatedAt = Date.now()
        }
      }
    } catch (err) {
      console.error('[FLOWW] purgeAutoCarryovers failed:', err?.message || 'Unknown error')
    }
  }

  // ── Asset management ──
  function addAsset(asset) {
    try {
      assets.value.push({ ...asset, id: uuidv4(), lastUpdated: Date.now() })
    } catch (err) {
      console.error('[FLOWW] addAsset failed:', err?.message || 'Unknown error')
    }
  }

  function updateAsset(id, updates) {
    try {
      const a = assets.value.find(a => a.id === id)
      if (a) Object.assign(a, updates, { lastUpdated: Date.now() })
    } catch (err) {
      console.error('[FLOWW] updateAsset failed:', err?.message || 'Unknown error')
    }
  }

  function removeAsset(id) {
    try {
      assets.value = assets.value.filter(a => a.id !== id)
    } catch (err) {
      console.error('[FLOWW] removeAsset failed:', err?.message || 'Unknown error')
    }
  }

  const _generatingMonths = new Set()

  function recurringDueDate(targetMonth, dayOfMonth) {
    const [ty, tm] = targetMonth.split('-').map(Number)
    const day = Math.max(1, Math.min(31, Number(dayOfMonth) || 1))
    const window = getCycleWindow(targetMonth)

    const onDay = monthDate => {
      const clamped = Math.min(day, getDaysInMonth(monthDate))
      return new Date(monthDate.getFullYear(), monthDate.getMonth(), clamped)
    }

    if (!window?.start) {
      const fallback = day >= SALARY_CUTOFF_DAY
        ? subMonths(new Date(ty, tm - 1), 1)
        : new Date(ty, tm - 1)
      return format(onDay(fallback), 'yyyy-MM-dd')
    }

    const start = parseISO(window.start)
    const firstInCycle = onDay(start)
    if (firstInCycle >= start) return format(firstInCycle, 'yyyy-MM-dd')
    return format(onDay(addMonths(start, 1)), 'yyyy-MM-dd')
  }


  function generateRecurringExpenses(targetMonth) {
    // Prevent concurrent generation for the same month (rapid month navigation)
    if (_generatingMonths.has(targetMonth)) return
    _generatingMonths.add(targetMonth)

    try {
      const [ty, tm] = targetMonth.split('-').map(Number)

      for (const schedule of recurringSchedules.value) {
        if (!schedule.active) continue
        if (schedule.startMonth > targetMonth) continue

        // Check if expense already exists for this schedule + month
        const exists = expenses.value.some(e =>
          e.scheduleId === schedule.id && e.monthYear === targetMonth
        )
        if (exists) continue

        let dueDate
        try {
          dueDate = recurringDueDate(targetMonth, schedule.dayOfMonth)
        } catch {
          dueDate = format(new Date(ty, tm - 1, 1), 'yyyy-MM-dd')
        }

        expenses.value.push({
          id: uuidv4(),
          name: schedule.name,
          amount: schedule.amount,
          category: schedule.category,
          icon: schedule.icon || 'subscriptions',
          iconColor: schedule.iconColor || '#FFB4AB',
          dueDate,
          monthYear: targetMonth,
          status: 'pending',
          isRecurring: true,
          scheduleId: schedule.id,
          accountId: schedule.accountId || undefined,
          paidByCardId: schedule.paidByCardId || undefined,
          paidFromCash: schedule.paidFromCash || undefined,
          via: schedule.via || undefined,
          createdAt: Date.now(),
          updatedAt: Date.now()
        })
      }
    } catch (err) {
      console.error('[FLOWW] generateRecurringExpenses failed:', err?.message || 'Unknown error')
    } finally {
      _generatingMonths.delete(targetMonth)
    }
  }

  function setLastRecurringGenMonth(month) {
    lastRecurringGenMonth.value = month
  }

  // Backfill recurring rows for every budget month from the last generated one
  // up to (and including) the current budget month. Fixes two bugs:
  //  - the boot used the calendar month, not the budget month
  //  - if the app wasn't opened for >1 month, intermediate months were skipped.
  // generateRecurringExpenses dedups internally, so this is safe to re-run.
  function catchUpRecurring() {
    const target = getBudgetMonth()
    const last = lastRecurringGenMonth.value
    if (last && last >= target) return
    if (last && /^\d{4}-\d{2}$/.test(last)) {
      const [ly, lm] = last.split('-').map(Number)
      const [ty, tm] = target.split('-').map(Number)
      let d = addMonths(new Date(ly, lm - 1), 1)
      const end = new Date(ty, tm - 1)
      let guard = 0
      while (d <= end && guard < 120) {
        generateRecurringExpenses(format(d, 'yyyy-MM'))
        d = addMonths(d, 1)
        guard++
      }
    } else {
      generateRecurringExpenses(target)
    }
    lastRecurringGenMonth.value = target
  }

  function markAsOverdue(id) {
    try {
      const e = expenses.value.find(e => e.id === id)
      if (e) e.status = 'overdue'
    } catch (err) {
      console.error('[FLOWW] markAsOverdue failed:', err?.message || 'Unknown error')
    }
  }

  // Skip a single loan EMI: push it and every subsequent unpaid EMI in the
  // same loan forward by 1 month. Loan totals (totalAmount, monthsPaid,
  // outstandingBalance) are untouched — we're only re-dating obligations.
  function skipEmiMonth(emiId) {
    try {
      const target = expenses.value.find(e => e.id === emiId)
      if (!target) return { success: false, errors: ['EMI not found'] }
      if (target.category !== 'loans' || !target.isInstallment) {
        return { success: false, errors: ['Only loan EMIs can be skipped'] }
      }
      if (target.status === 'paid') {
        return { success: false, errors: ['Cannot skip a paid EMI'] }
      }
      const fromInstallment = target.installmentCurrent || 0
      const loanId = target.loanId

      // All unpaid EMIs in this loan from the target onwards, sorted ascending
      const toShift = expenses.value
        .filter(e =>
          e.category === 'loans' &&
          e.isInstallment &&
          e.status !== 'paid' &&
          ((loanId && e.loanId === loanId) ||
           (!loanId && e.installmentGroupId === target.installmentGroupId)) &&
          (e.installmentCurrent || 0) >= fromInstallment
        )
        .sort((a, b) => (a.installmentCurrent || 0) - (b.installmentCurrent || 0))

      if (toShift.length === 0) return { success: false, errors: ['No EMIs to shift'] }

      // Find the smallest forward shift (in months) needed so that the FIRST
      // EMI lands strictly after today. If the user is skipping an already-
      // overdue EMI, +1 month might still be in the past; we step forward
      // until it's in the future, then apply the same shift to all in the chain.
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      let shiftMonths = 1
      try {
        const firstDue = parseISO(toShift[0].dueDate)
        let candidate = addMonths(firstDue, shiftMonths)
        while (candidate <= today && shiftMonths < 24) {
          shiftMonths += 1
          candidate = addMonths(firstDue, shiftMonths)
        }
      } catch {}

      for (const e of toShift) {
        try {
          const d = parseISO(e.dueDate)
          const newDate = addMonths(d, shiftMonths)
          e.dueDate = format(newDate, 'yyyy-MM-dd')
          // Shift monthYear by the same number of months as dueDate.
          // Don't recompute via getBudgetMonth(newDate): the cycle rule would
          // cause an extra month jump for EMIs stored under an older convention.
          // The EMI's original monthYear is the source of truth.
          if (typeof e.monthYear === 'string' && /^\d{4}-\d{2}$/.test(e.monthYear)) {
            const [y, m] = e.monthYear.split('-').map(Number)
            const oldMonthDate = new Date(y, m - 1, 1)
            const newMonthDate = addMonths(oldMonthDate, shiftMonths)
            e.monthYear = format(newMonthDate, 'yyyy-MM')
          } else {
            // Fallback for malformed monthYear: derive from new dueDate.
            e.monthYear = getBudgetMonth(e.dueDate)
          }
          e.skippedAt = Date.now()
          e.updatedAt = Date.now()
        } catch {}
      }

      // Bump the loan's next due date by the same shift count so the dashboard
      // and LoanCard's payoffDate calc reflect the new schedule.
      if (loanId) {
        const loan = loans.value.find(l => l.id === loanId)
        if (loan && loan.nextDueDate) {
          try {
            const nd = addMonths(parseISO(loan.nextDueDate), shiftMonths)
            loan.nextDueDate = format(nd, 'yyyy-MM-dd')
            loan.updatedAt = Date.now()
          } catch {}
        }
      }

      refreshNotifications()
      return { success: true, shiftedCount: toShift.length }
    } catch (err) {
      console.error('[FLOWW] skipEmiMonth failed:', err?.message || 'Unknown error')
      return { success: false, errors: ['Operation failed'] }
    }
  }

  function payOffInstallments(groupId, count, targetMonth) {
    try {
      if (!groupId || !targetMonth) return { success: false, paidCount: 0 }
      if (count != null && count <= 0) return { success: false, paidCount: 0 }

      const pending = expenses.value
        .filter(e => e.installmentGroupId === groupId && e.status !== 'paid')
        .sort((a, b) => (a.installmentCurrent || 0) - (b.installmentCurrent || 0))

      if (pending.length === 0) return { success: false, paidCount: 0 }

      const toPay = count != null ? pending.slice(0, count) : pending

      for (const e of toPay) {
        ensureSource(e)
        e.status = 'paid'
        e.monthYear = targetMonth
        e.dueDate = format(new Date(), 'yyyy-MM-dd')
        e.paidAt = Date.now()
        e.paidEarly = true
        e.updatedAt = Date.now()

        // Sync loan monthsPaid + outstandingBalance if this is a loan EMI
        if (e.category === 'loans' && e.isInstallment) {
          const loan = findLoanForExpense(e)
          if (loan) {
            if (loan.totalMonths && (loan.monthsPaid || 0) < loan.totalMonths) {
              loan.monthsPaid = (loan.monthsPaid || 0) + 1
            }
            loan.totalRepaid = (loan.totalRepaid || 0) + e.amount
            const baseBalance = typeof loan.outstandingBalance === 'number'
              ? loan.outstandingBalance
              : (loan.totalAmount || 0)
            loan.outstandingBalance = Math.max(0, baseBalance - e.amount)
            if (loan.outstandingBalance === 0 && loan.status === 'active') {
              loan.status = 'completed'
            }
            loan.updatedAt = Date.now()
          }
        }

        // Sync credit card: a card-installment EMI is a creditCardPayment that
        // pays down the card; a regular EMI charged to a card adds to it.
        // Mirrors markAsPaid so early payoffs don't desync card outstanding.
        if (e.category === 'creditCardPayment' && e.cardId) {
          syncCardPayment(e.cardId, e.amount, 'apply')
        } else if (e.paidByCardId && !e.paidFromCash && e.category !== 'cashWithdrawal') {
          syncCardCharge(e.paidByCardId, e.amount, 'apply')
        }

        // Sync cash asset (cashWithdrawal increases balance, paidFromCash decreases it).
        // Mirrors the logic in markAsPaid so early payoffs don't drift the cash asset.
        if (e.category === 'cashWithdrawal') {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance += e.amount
          cashAsset.lastUpdated = Date.now()
        } else if (e.paidFromCash) {
          const cashAsset = getOrCreateCashAsset()
          cashAsset.balance -= e.amount
          cashAsset.lastUpdated = Date.now()
        }
      }

      // Re-derive the loan from paid rows and re-amortize what remains.
      const loanIdToFix = toPay.find(e => e.category === 'loans' && e.isInstallment)?.loanId
      if (loanIdToFix) reamortizeLoan(loanIdToFix)

      refreshNotifications()
      return { success: true, paidCount: toPay.length }
    } catch (err) {
      console.error('[FLOWW] payOffInstallments failed:', err?.message || 'Unknown error')
      return { success: false, paidCount: 0 }
    }
  }

  // Re-derive a loan from its actual paid rows and rebuild the remaining EMI
  // schedule so it sums exactly to the outstanding balance. "Finish sooner":
  // paying extra in a month shrinks/drops trailing EMIs. Absolute & idempotent
  // (computes from scratch, never increments), so it's safe to call after the
  // per-row sync in markAsPaid / updateExpense / payOffInstallments.
  function reamortizeLoan(loanId) {
    try {
      if (!loanId) return { success: false }
      const loan = loans.value.find(l => l.id === loanId)
      if (!loan) return { success: false }

      const round2 = v => Math.round((v + Number.EPSILON) * 100) / 100

      const emis = expenses.value
        .filter(e => e.category === 'loans' && e.isInstallment && e.loanId === loanId)
        .sort((a, b) => (a.installmentCurrent || 0) - (b.installmentCurrent || 0))
      const paid = emis.filter(e => e.status === 'paid')
      const pending = emis.filter(e => e.status !== 'paid')

      const paidSum = paid.reduce((s, e) => s + (e.amount || 0), 0)
      const payoffSum = expenses.value
        .filter(e => e.category === 'loans' && !e.isInstallment && e.status === 'paid' &&
          (e.loanId === loanId || e.name === `${loan.name} (Full Payoff)`))
        .reduce((s, e) => s + (e.amount || 0), 0)

      const repaid = round2(paidSum + payoffSum)
      const outstanding = Math.max(0, round2((loan.totalAmount || 0) - repaid))

      // Desired remaining EMI amounts, stepping by the standard monthly amount.
      const monthly = loan.monthlyInstallment > 0 ? loan.monthlyInstallment : outstanding
      const desired = []
      let remaining = outstanding
      while (remaining > 0.005 && desired.length < 600) {
        const amt = round2(Math.min(monthly, remaining))
        desired.push(amt)
        remaining = round2(remaining - amt)
      }

      const template = emis[emis.length - 1] || null
      const groupId = template?.installmentGroupId
      const emiName = template?.name || `${loan.name} EMI`

      // Anchor for any rows we need to ADD (only when outstanding grew beyond
      // existing pending capacity, e.g. after un-marking a paid EMI).
      let addAnchor
      try {
        if (pending.length) addAnchor = parseISO(pending[pending.length - 1].dueDate)
        else if (paid.length) addAnchor = parseISO(paid[paid.length - 1].dueDate)
        else addAnchor = new Date()
      } catch { addAnchor = new Date() }
      let added = 0

      const finalPending = []
      for (let i = 0; i < desired.length; i++) {
        if (i < pending.length) {
          pending[i].amount = desired[i]
          pending[i].updatedAt = Date.now()
          finalPending.push(pending[i])
        } else {
          added += 1
          const dueStr = format(addMonths(addAnchor, added), 'yyyy-MM-dd')
          const row = {
            id: uuidv4(),
            name: emiName,
            amount: desired[i],
            category: 'loans',
            dueDate: dueStr,
            monthYear: getBudgetMonth(dueStr),
            status: 'pending',
            isRecurring: true,
            isInstallment: true,
            installmentCurrent: 0,
            installmentTotal: 0,
            installmentGroupId: groupId,
            loanId,
            icon: template?.icon || 'account_balance',
            iconColor: template?.iconColor || '#C0C1FF',
            // Inherit the payment method from the template so a card-financed
            // loan's regenerated EMIs still sync the card when paid.
            paidByCardId: template?.paidByCardId || undefined,
            paidFromCash: template?.paidFromCash || undefined,
            accountId: template?.accountId || undefined,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          expenses.value.push(row)
          finalPending.push(row)
        }
      }

      // Delete surplus pending rows (the "finish sooner" tail).
      const keepIds = new Set(finalPending.map(e => e.id))
      const surplusIds = new Set(pending.filter(e => !keepIds.has(e.id)).map(e => e.id))
      if (surplusIds.size) {
        expenses.value = expenses.value.filter(e => !surplusIds.has(e.id))
      }

      // Renumber the whole series by schedule order for consistent display.
      const finalEmis = [...paid, ...finalPending].sort((a, b) => {
        try { return parseISO(a.dueDate) - parseISO(b.dueDate) } catch { return 0 }
      })
      finalEmis.forEach((e, i) => {
        e.installmentCurrent = i + 1
        e.installmentTotal = finalEmis.length
      })

      loan.totalRepaid = repaid
      loan.outstandingBalance = outstanding
      loan.monthsPaid = paid.length
      loan.totalMonths = finalEmis.length
      loan.nextDueDate = finalPending[0]?.dueDate || loan.nextDueDate
      loan.status = outstanding === 0 ? 'completed' : 'active'
      loan.updatedAt = Date.now()

      refreshNotifications()
      return { success: true, outstanding, remainingEmis: finalPending.length }
    } catch (err) {
      console.error('[FLOWW] reamortizeLoan failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  function syncBudgetMonth() {
    try {
      syncSalaryAnchors()
      const target = getBudgetMonth()
      if (currentMonth.value !== target) currentMonth.value = target
      catchUpRecurring()
    } catch (err) {
      console.error('[FLOWW] syncBudgetMonth failed:', err?.message || 'Unknown error')
    }
  }

  const usdBalance = computed(() => {
    const opening = Number(usdAccount.value?.openingBalance) || 0
    const openingDate = usdAccount.value?.openingDate || null

    const salaryIn = Object.entries(monthlyIncomes.value)
      .filter(([, mi]) => mi?.budgetSource === 'transfers')
      .filter(([, mi]) => !openingDate || (mi.receivedDate && mi.receivedDate >= openingDate))
      .reduce((sum, [, mi]) => sum + (Number(mi.usdAmount) || 0), 0)

    const movedOut = (currencyTransfers.value || [])
      .filter(t => !openingDate || (t?.date && t.date >= openingDate))
      .reduce((sum, t) => sum + (Number(t.usdAmount) || 0), 0)

    return Math.round((opening + salaryIn - movedOut) * 100) / 100
  })

  function setUsdOpeningBalance(balance, date) {
    try {
      usdAccount.value = {
        openingBalance: Math.round((Number(balance) || 0) * 100) / 100,
        openingDate: date || format(new Date(), 'yyyy-MM-dd')
      }
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] setUsdOpeningBalance failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  function addCurrencyTransfer(data) {
    try {
      const usdAmount = Number(data?.usdAmount) || 0
      const lkrAmount = Number(data?.lkrAmount) || 0
      if (usdAmount <= 0 || lkrAmount <= 0) return { success: false, error: 'Both amounts are required' }

      const date = data.date || format(new Date(), 'yyyy-MM-dd')
      const transfer = {
        id: uuidv4(),
        date,
        usdAmount: Math.round(usdAmount * 100) / 100,
        lkrAmount: Math.round(lkrAmount * 100) / 100,
        monthYear: data.monthYear || getBudgetMonth(date),
        note: data.note || '',
        createdAt: Date.now(),
        _updatedAt: Date.now()
      }
      currencyTransfers.value.push(transfer)
      return { success: true, transfer }
    } catch (err) {
      console.error('[FLOWW] addCurrencyTransfer failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  function updateCurrencyTransfer(id, patch) {
    try {
      const t = currencyTransfers.value.find(x => x.id === id)
      if (!t) return { success: false }
      if (patch.usdAmount !== undefined) t.usdAmount = Math.round((Number(patch.usdAmount) || 0) * 100) / 100
      if (patch.lkrAmount !== undefined) t.lkrAmount = Math.round((Number(patch.lkrAmount) || 0) * 100) / 100
      if (patch.note !== undefined) t.note = patch.note
      if (patch.date !== undefined) {
        t.date = patch.date
        t.monthYear = getBudgetMonth(patch.date)
      }
      t._updatedAt = Date.now()
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] updateCurrencyTransfer failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  function deleteCurrencyTransfer(id) {
    try {
      currencyTransfers.value = currencyTransfers.value.filter(t => t.id !== id)
      return { success: true }
    } catch (err) {
      console.error('[FLOWW] deleteCurrencyTransfer failed:', err?.message || 'Unknown error')
      return { success: false }
    }
  }

  function seedData() {
    if (initialized.value) return
    initialized.value = true
  }

  return {
    income,
    monthlyIncomes,
    hasRecordedIncome,
    currencyTransfers, usdAccount, usdBalance,
    transfersForMonth, lkrMovedForMonth, usdMovedForMonth, usesTransferBudget,
    addCurrencyTransfer, updateCurrencyTransfer, deleteCurrencyTransfer, setUsdOpeningBalance,
    expenses,
    loans,
    loanDisbursements,
    budgetLimits,
    currentMonth,
    initialized,
    lastRecurringGenMonth,
    recurringSchedules,
    assets, addAsset, updateAsset, removeAsset,
    cashOnHand, bankBalance, monthlyBankRemaining, monthlyClearBalance, totalCashWithdrawnThisMonth, currentMonthCardCharged, getOrCreateCashAsset,
    excludedFromSpending,
    totalIncome,
    currentMonthExpenses,
    totalSpent,
    totalPending,
    totalSavedThisMonth,
    totalLentThisMonth,
    remaining,
    currentMonthLoanReceived,
    currentMonthDebtRepaid,
    currentMonthDebtPending,
    totalAvailable,
    budgetUtilization,
    savingsRate,
    expensesByCategory,
    fixedExpenses,
    variableExpenses,
    installmentExpenses,
    activeLoans,
    totalLoanDebt,
    addExpense,
    setDefaultPaySource,
    updateExpense,
    markAsPaid,
    deleteExpense,
    cancelRecurring,
    addSchedule,
    stopSchedule,
    updateSchedule,
    deleteSchedule,
    navigateMonth,
    addLoan,
    updateLoan,
    deleteLoan,
    addLoanDisbursement,
    removeLoanDisbursement,
    setMonthlyIncome,
    getMonthIncome,
    getIncomeForMonth,
    monthLeftover,
    purgeAutoCarryovers,
    backfillSmsFingerprints,
    _createdAtMigratedToDueDate,
    migrateCreatedAtToDueDate,
    generateRecurringExpenses, ensureRecurringForMonth, jumpToMonth,
    setLastRecurringGenMonth, catchUpRecurring, syncSalaryAnchors, syncBudgetMonth,
    markAsOverdue,
    payOffInstallments,
    skipEmiMonth,
    reamortizeLoan,
    seedData
  }
}, { persist: { storage: capacitorStorage } })
