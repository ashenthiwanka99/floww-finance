import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { getBudgetMonth } from './format'

export function checkDataIntegrity(financeStore, savingsStore, buyListStore, settingsStore, creditCardStore = null, accountsStore = null) {
  const issues = []

  if (accountsStore) {
    const walletCurrency = { lkr: 'LKR', usd: 'USD', cash: 'LKR' }
    ;(accountsStore.accounts || []).forEach(a => {
      if (!a.id) { a.id = uuidv4(); issues.push(`Generated ID for account "${a.name || '?'}"`) }
      if (!walletCurrency[a.wallet]) { a.wallet = 'lkr'; issues.push(`Put account "${a.name || '?'}" in the LKR wallet`) }
      if (a.currency !== walletCurrency[a.wallet]) a.currency = walletCurrency[a.wallet]
      if (a.openingBalance !== null && a.openingBalance !== undefined && !Number.isFinite(Number(a.openingBalance))) {
        a.openingBalance = 0
        issues.push(`Fixed invalid starting balance on "${a.name || '?'}"`)
      }
      if (!Array.isArray(a.cardLast4)) a.cardLast4 = []
      if (!a.createdAt) a.createdAt = Date.now()
    })
    ;[...(accountsStore.incomes || []), ...(accountsStore.corrections || [])].forEach(x => {
      if (!x.id) x.id = uuidv4()
      if (!Number.isFinite(Number(x.amount))) { x.amount = 0; issues.push(`Fixed invalid amount on "${x.name || x.note || 'money in'}"`) }
      if (!x.createdAt) x.createdAt = Date.now()
    })
    const seen = new Set()
    const beforeIncomes = (accountsStore.incomes || []).length
    accountsStore.incomes = (accountsStore.incomes || []).filter(i => {
      if (seen.has(i.id)) return false
      seen.add(i.id)
      return true
    })
    if (accountsStore.incomes.length !== beforeIncomes) issues.push('Removed duplicate money-in records')
  }

  ;(financeStore.currencyTransfers || []).forEach(t => {
    if (!t.id) t.id = uuidv4()
    if (typeof t.amount === 'number' && !Number.isFinite(t.amount)) t.amount = 0
    if (typeof t.toAmount === 'number' && !Number.isFinite(t.toAmount)) t.toAmount = 0
  })

  // 1. Fix expenses with NaN/null/undefined amounts
  financeStore.expenses.forEach((e, i) => {
    if (e.amount === null || e.amount === undefined || isNaN(e.amount)) {
      financeStore.expenses[i].amount = 0
      issues.push(`Fixed invalid amount on "${e.name || 'unknown'}"`)
    }
  })

  // 2. Fix expenses missing IDs
  financeStore.expenses.forEach((e, i) => {
    if (!e.id) {
      financeStore.expenses[i].id = uuidv4()
      issues.push(`Generated missing ID for "${e.name || 'unknown'}"`)
    }
  })

  // 3. Fix expenses missing monthYear (uses the salary-cycle rule)
  financeStore.expenses.forEach((e, i) => {
    if (!e.monthYear && e.dueDate) {
      try {
        financeStore.expenses[i].monthYear = getBudgetMonth(e.dueDate)
        issues.push(`Derived monthYear for "${e.name}"`)
      } catch {}
    }
  })

  // 4. Fix loans where monthsPaid exceeds totalMonths
  financeStore.loans.forEach((l, i) => {
    if (l.monthsPaid > l.totalMonths) {
      financeStore.loans[i].monthsPaid = l.totalMonths
      issues.push(`Capped monthsPaid to ${l.totalMonths} for "${l.name}"`)
    }
  })

  // 5. Fix orphaned loan disbursements
  if (financeStore.loanDisbursements?.length) {
    const loanIds = new Set(financeStore.loans.map(l => l.id))
    const before = financeStore.loanDisbursements.length
    financeStore.loanDisbursements = financeStore.loanDisbursements.filter(d => loanIds.has(d.loanId))
    const removed = before - financeStore.loanDisbursements.length
    if (removed > 0) issues.push(`Removed ${removed} orphaned loan disbursements`)
  }

  // 5. Fix savings goals with NaN amounts, then reconcile savedAmount with the
  // sum of its deposits (the source of truth) so any sync drift self-heals.
  savingsStore.goals.forEach((g, i) => {
    if (isNaN(g.savedAmount) || g.savedAmount === null) {
      savingsStore.goals[i].savedAmount = 0
      issues.push(`Fixed invalid savedAmount on "${g.name}"`)
    }
    if (isNaN(g.targetAmount) || g.targetAmount === null) {
      savingsStore.goals[i].targetAmount = 0
      issues.push(`Fixed invalid targetAmount on "${g.name}"`)
    }
    if (Array.isArray(g.deposits) && g.deposits.length) {
      const depositSum = Math.round(
        g.deposits.reduce((s, d) => s + (Number(d.amount) || 0), 0) * 100
      ) / 100
      if (Math.abs((g.savedAmount || 0) - depositSum) > 0.5) {
        issues.push(`Resynced "${g.name}" savedAmount: ${g.savedAmount} → ${depositSum}`)
        g.savedAmount = depositSum
      }
    }
  })

  // 6. Fix buy list items missing IDs
  buyListStore.items.forEach((item, i) => {
    if (!item.id) {
      buyListStore.items[i].id = uuidv4()
      issues.push(`Generated ID for buy item "${item.name}"`)
    }
  })

  // 7. Remove duplicate expenses (same id)
  const seenIds = new Set()
  const beforeCount = financeStore.expenses.length
  financeStore.expenses = financeStore.expenses.filter(e => {
    if (seenIds.has(e.id)) return false
    seenIds.add(e.id)
    return true
  })
  const dupesRemoved = beforeCount - financeStore.expenses.length
  if (dupesRemoved > 0) issues.push(`Removed ${dupesRemoved} duplicate expenses`)

  // 8. Fix loans with invalid monthsPaid
  financeStore.loans.forEach((l, i) => {
    if (l.monthsPaid < 0) {
      financeStore.loans[i].monthsPaid = 0
      issues.push(`Fixed negative monthsPaid on "${l.name}"`)
    }
    if (l.totalMonths && l.monthsPaid > l.totalMonths) {
      financeStore.loans[i].monthsPaid = l.totalMonths
      issues.push(`Capped monthsPaid on "${l.name}"`)
    }
  })

  // 9. Fix loans missing IDs
  financeStore.loans.forEach((l, i) => {
    if (!l.id) {
      financeStore.loans[i].id = uuidv4()
      issues.push(`Generated ID for loan "${l.name}"`)
    }
  })

  // 10. Deduplicate recurring expenses (fix exponential duplication bug)
  const monthGroups = {}
  financeStore.expenses.forEach(e => {
    if (!e.monthYear) return
    if (!monthGroups[e.monthYear]) monthGroups[e.monthYear] = []
    monthGroups[e.monthYear].push(e)
  })

  Object.entries(monthGroups).forEach(([month, monthExpenses]) => {
    const seen = new Set()
    const toRemove = []
    monthExpenses.forEach(e => {
      if (e.isRecurring && !e.isInstallment) {
        // Use recurringGroupName for precise matching, fall back to name|category
        const key = (e.recurringGroupName || `${e.name}|${e.category}`) + `|${e.monthYear}`
        if (seen.has(key)) {
          toRemove.push(e.id)
        } else {
          seen.add(key)
        }
      }
    })
    if (toRemove.length > 0) {
      financeStore.expenses = financeStore.expenses.filter(e => !toRemove.includes(e.id))
      issues.push(`Removed ${toRemove.length} duplicate recurring expenses in ${month}`)
    }
  })

  // 11. Sync loan monthsPaid with actual paid EMI expenses
  financeStore.loans.forEach(loan => {
    const emiName = `${loan.name} EMI`
    const paidCount = financeStore.expenses.filter(
      e => e.name === emiName && e.category === 'loans' && e.isInstallment && e.status === 'paid'
    ).length
    if (paidCount > (loan.monthsPaid || 0)) {
      issues.push(`Synced "${loan.name}" monthsPaid: ${loan.monthsPaid || 0} → ${paidCount}`)
      loan.monthsPaid = paidCount
    }
  })

  // 12. Fix floating point in monthly incomes
  Object.values(financeStore.monthlyIncomes || {}).forEach(mi => {
    if (mi.lkrSalary) mi.lkrSalary = Math.round(mi.lkrSalary * 100) / 100
    if (mi.total) mi.total = Math.round(mi.total * 100) / 100
  })

  // Check 13: Backfill loanId on legacy EMI expenses
  financeStore.expenses.forEach(e => {
    if (e.category === 'loans' && e.isInstallment && !e.loanId) {
      const loanName = e.name.replace(/\s+EMI$/, '')
      const loan = financeStore.loans.find(l => l.name === loanName)
      if (loan) {
        e.loanId = loan.id
        issues.push(`Backfilled loanId for "${e.name}"`)
      }
    }
  })

  // Check 14: Backfill createdAt on entities missing it
  const backfillTime = Date.now()
  financeStore.expenses.forEach(e => { if (!e.createdAt) { e.createdAt = backfillTime; issues.push(`Backfilled createdAt for expense "${e.name}"`) } })
  financeStore.loans.forEach(l => { if (!l.createdAt) { l.createdAt = backfillTime } })
  savingsStore.goals.forEach(g => { if (!g.createdAt) { g.createdAt = backfillTime } })
  buyListStore.items.forEach(i => { if (!i.createdAt) { i.createdAt = backfillTime } })

  // Check 15: Add uuid to custom categories missing it
  if (settingsStore && settingsStore.customCategories) {
    settingsStore.customCategories.forEach(c => {
      if (!c.id) {
        c.id = Date.now().toString(36) + Math.random().toString(36).slice(2)
        issues.push(`Generated ID for category "${c.name}"`)
      }
    })
  }

  // Check 16: Add uuid to deposits missing it
  savingsStore.goals.forEach(g => {
    (g.deposits || []).forEach(d => {
      if (!d.id) {
        d.id = Date.now().toString(36) + Math.random().toString(36).slice(2)
      }
    })
  })

  // Check 17: Clean up raw URL profile images (should be base64)
  if (settingsStore?.profileImage && !settingsStore.profileImage.startsWith('data:')) {
    settingsStore.profileImage = null
    issues.push('Removed invalid profile image URL')
  }

  // Check 18: Migrate old recurring expenses to schedule system
  const existingScheduleIds = new Set((financeStore.recurringSchedules || []).map(s => s.id))
  const migratedGroups = new Set()

  financeStore.expenses.forEach(e => {
    if (e.isRecurring && !e.isInstallment && !e.scheduleId) {
      const key = e.recurringGroupName || `${e.name}|${e.category}`
      if (migratedGroups.has(key)) return // Already migrated this group

      // Create a schedule from this expense
      const dayOfMonth = e.dueDate ? new Date(e.dueDate).getDate() : 1
      const scheduleId = Date.now().toString(36) + Math.random().toString(36).slice(2)

      if (!financeStore.recurringSchedules) financeStore.recurringSchedules = []
      financeStore.recurringSchedules.push({
        id: scheduleId,
        name: e.name,
        amount: e.amount,
        category: e.category,
        dayOfMonth,
        icon: e.icon || 'subscriptions',
        iconColor: e.iconColor || '#FFB4AB',
        startMonth: e.monthYear || format(new Date(), 'yyyy-MM'),
        active: true,
        createdAt: e.createdAt || Date.now(),
        updatedAt: Date.now()
      })

      // Backfill scheduleId on ALL expenses in this group
      financeStore.expenses.forEach(exp => {
        if (exp.isRecurring && !exp.isInstallment && !exp.scheduleId) {
          const expKey = exp.recurringGroupName || `${exp.name}|${exp.category}`
          if (expKey === key) {
            exp.scheduleId = scheduleId
          }
        }
      })

      migratedGroups.add(key)
      issues.push(`Migrated recurring "${e.name}" to schedule system`)
    }
  })

  // Check 19: Migrate legacy "Cash" category to "cashWithdrawal"
  // Old data (or accidental custom-category use) has exact category "Cash".
  // This should behave as a cash withdrawal (excluded from spending).
  financeStore.expenses.forEach(e => {
    if (e.category === 'Cash') {
      e.category = 'cashWithdrawal'
      e.icon = 'local_atm'
      e.iconColor = '#00F5C4'
      e.updatedAt = Date.now()
      issues.push(`Migrated "${e.name}" from Cash to cashWithdrawal`)
    }
  })

  // Check 20: Liability-account migration
  // Backfill outstandingBalance + totalRepaid on loans, and link Full Payoff rows by loanId.
  // Idempotent: gated on `typeof !== 'number'` and `!e.loanId`.
  //
  // We compute totalRepaid from the ACTUAL sum of paid EMI rows (not from
  // monthlyInstallment * monthsPaid) so that legacy data where the old
  // Pay-Off Remaining flow inflated `monthsPaid` to totalMonths without
  // creating EMI rows doesn't get double-counted via the formula.
  // Final value is also clamped to totalAmount as a safety net.
  financeStore.loans.forEach(loan => {
    if (typeof loan.outstandingBalance !== 'number') {
      const emiName = `${loan.name} EMI`

      const paidEMISum = financeStore.expenses
        .filter(e =>
          e.category === 'loans' &&
          e.isInstallment &&
          e.status === 'paid' &&
          (e.loanId === loan.id || (!e.loanId && e.name === emiName))
        )
        .reduce((s, e) => s + (e.amount || 0), 0)

      const payoffSum = financeStore.expenses
        .filter(e =>
          e.category === 'loans' &&
          !e.isInstallment &&
          e.status === 'paid' &&
          (e.loanId === loan.id ||
           e.name === `${loan.name} (Full Payoff)`)
        )
        .reduce((s, e) => s + (e.amount || 0), 0)

      // If no EMI rows exist at all (very old data), fall back to the
      // monthsPaid * monthlyInstallment formula so we don't underreport.
      const hasAnyEMIRows = financeStore.expenses.some(e =>
        e.category === 'loans' && e.isInstallment &&
        (e.loanId === loan.id || (!e.loanId && e.name === emiName))
      )
      const formulaRepaid = (loan.monthlyInstallment || 0) * (loan.monthsPaid || 0)
      const baseRepaid = hasAnyEMIRows ? paidEMISum : formulaRepaid

      loan.totalRepaid = Math.min((loan.totalAmount || 0), baseRepaid + payoffSum)
      loan.outstandingBalance = Math.max(0, (loan.totalAmount || 0) - loan.totalRepaid)
      if (loan.outstandingBalance === 0 && loan.status === 'active') {
        loan.status = 'completed'
      }
      loan.updatedAt = Date.now()
      issues.push(`Backfilled liability fields on loan "${loan.name}"`)
    }
  })

  // Backfill loanId on existing "Full Payoff" rows by name match
  financeStore.expenses.forEach(e => {
    if (e.category === 'loans' && !e.isInstallment && !e.loanId &&
        typeof e.name === 'string' && e.name.endsWith(' (Full Payoff)')) {
      const baseName = e.name.replace(/\s*\(Full Payoff\)$/, '').trim()
      const loan = financeStore.loans.find(l =>
        l.name === baseName || (l.name || '').trim() === baseName
      )
      if (loan) {
        e.loanId = loan.id
        e.updatedAt = Date.now()
        issues.push(`Linked Full Payoff row "${e.name}" to loan ${loan.id}`)
      }
    }
  })

  // Check 21: Delete orphan pending EMI rows for loans that are already completed.
  // Older versions of Pay-Off Remaining didn't always clean these up, leaving
  // ghost obligations alongside the (Full Payoff) entry that already accounts
  // for them. Keeping both would double-count, so the orphans go.
  // Only treat a loan as truly completed (safe to drop pending EMIs) when its
  // balance is actually zero. Guards against an inconsistent "completed but
  // outstanding > 0" state wrongly deleting legitimate future EMIs.
  const completedLoanIds = new Set(
    financeStore.loans
      .filter(l => l.status === 'completed' && !(l.outstandingBalance > 0))
      .map(l => l.id)
  )
  if (completedLoanIds.size > 0) {
    financeStore.expenses = financeStore.expenses.filter(e => {
      if (e.category === 'loans' && e.isInstallment && e.status !== 'paid' &&
          e.loanId && completedLoanIds.has(e.loanId)) {
        issues.push(`Removed orphan pending EMI "${e.name}" for completed loan`)
        return false
      }
      return true
    })
  }

  // Check 23: Credit card integrity
  // Recompute each card's currentOutstanding from the source of truth — paid
  // expenses with paidByCardId (charges) minus paid creditCardPayment expenses
  // (payments). Catches drift from interrupted writes, manual data edits, etc.
  if (creditCardStore && Array.isArray(creditCardStore.cards)) {
    creditCardStore.cards.forEach(card => {
      if (!card.id) { card.id = uuidv4(); issues.push(`Generated ID for card "${card.name || '?'}"`) }
      if (!card.createdAt) card.createdAt = Date.now()
      if (!card.updatedAt) card.updatedAt = card.createdAt
      if (card.active === undefined) card.active = true

      const charges = (financeStore.expenses || [])
        .filter(e => e.paidByCardId === card.id && e.status === 'paid')
        .reduce((s, e) => s + (e.amount || 0), 0)
      const payments = (financeStore.expenses || [])
        .filter(e => e.category === 'creditCardPayment' && e.cardId === card.id && e.status === 'paid')
        .reduce((s, e) => s + (e.amount || 0), 0)
      // Honor a manual outstanding override (set in EditCardSheet) so a user's
      // "adjust to match my statement" correction survives this recompute.
      const computed = Math.max(0, charges - payments + (card.outstandingAdjustment || 0))
      if (Math.abs((card.currentOutstanding || 0) - computed) > 0.5) {
        issues.push(`Resynced ${card.name} outstanding: ${card.currentOutstanding} → ${computed}`)
        card.currentOutstanding = computed
      }
      // Also refresh lifetime totals (cheap, prevents drift)
      card.totalCharged = charges
      card.totalPaid = payments
    })

    // Credit-line consistency: cards sharing a creditLineId must share a limit;
    // a "line of one" is meaningless — clear the linkage.
    const lineGroups = {}
    creditCardStore.cards.forEach(c => {
      if (!c.creditLineId) return
      ;(lineGroups[c.creditLineId] = lineGroups[c.creditLineId] || []).push(c)
    })
    Object.entries(lineGroups).forEach(([lineId, members]) => {
      if (members.length === 1) {
        members[0].creditLineId = null
        members[0].updatedAt = Date.now()
        issues.push(`Cleared singleton credit line on ${members[0].name}`)
        return
      }
      // Use the largest limit among members as the canonical shared limit
      const maxLimit = Math.max(...members.map(m => m.limit || 0))
      members.forEach(m => {
        if ((m.limit || 0) !== maxLimit) {
          issues.push(`Synced ${m.name} limit to shared credit line: ${m.limit} → ${maxLimit}`)
          m.limit = maxLimit
          m.updatedAt = Date.now()
        }
      })
    })
  }

  return issues
}
