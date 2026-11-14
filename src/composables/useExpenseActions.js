import { Notify } from 'quasar'
import { useFinanceStore } from '../stores/financeStore'
import { useTrashStore } from '../stores/trashStore'
import { useAccountsStore } from '../stores/accountsStore'
import { showToast, escapeHtml } from '../utils/toast'

// Mark-paid and delete (with trash + undo) shared by Home, Spending and Bills.
export function useExpenseActions() {
  const financeStore = useFinanceStore()
  const trashStore = useTrashStore()
  const accounts = useAccountsStore()

  async function markPaid(id) {
    const e = financeStore.expenses.find(x => x.id === id)
    if (e && accounts.tracking && !e.paidByCardId && !accounts.expenseAccountId(e) && e.category !== 'lend') {
      const src = accounts.applySource(accounts.defaultSource({ accountsOnly: true }))
      if (src.accountId) {
        e.accountId = src.accountId
        if (src.paidFromCash) e.paidFromCash = true
        if (src.via) e.via = src.via
      }
    }
    await financeStore.markAsPaid(id)
    const from = e ? accounts.sourceLabel(e) : ''
    showToast(from ? `Paid from ${from}` : 'Marked as paid', 'paid')
  }

  function deleteExpense(id) {
    const expense = financeStore.expenses.find(e => e.id === id)
    if (!expense) return

    // Recurring and installment rows take their unpaid siblings with them.
    let deletedOthers = []
    if (expense.isInstallment && expense.installmentGroupId) {
      deletedOthers = financeStore.expenses
        .filter(e => e.id !== id && e.installmentGroupId === expense.installmentGroupId && e.status !== 'paid')
        .map(e => ({ ...e }))
      deletedOthers.forEach(e => financeStore.deleteExpense(e.id))
    } else if (expense.isRecurring) {
      if (expense.scheduleId) {
        financeStore.stopSchedule(expense.scheduleId)
      } else {
        const identifier = expense.recurringGroupName || expense.name
        deletedOthers = financeStore.expenses
          .filter(e => e.id !== id && e.status !== 'paid' && e.isRecurring &&
            (e.recurringGroupName === identifier || e.name === expense.name))
          .map(e => ({ ...e }))
        deletedOthers.forEach(e => financeStore.deleteExpense(e.id))
        financeStore.expenses.forEach(e => {
          if (e.status === 'paid' && e.isRecurring && (e.recurringGroupName === identifier || e.name === expense.name)) {
            e.isRecurring = false
            e.updatedAt = Date.now()
          }
        })
      }
    }

    const now = Date.now()
    const allDeleted = [{ ...expense, deletedAt: now }, ...deletedOthers.map(e => ({ ...e, deletedAt: now }))]
    trashStore.addToTrash('expense', { items: allDeleted }, expense.name)
    financeStore.deleteExpense(id)

    const msg = expense.isInstallment
      ? `${expense.name}: plan cancelled`
      : expense.isRecurring
        ? `${expense.name}: stopped repeating`
        : `${expense.name} deleted`

    Notify.create({
      message: `<span class="material-symbols-outlined toast-icon">delete</span> ${escapeHtml(msg)}`,
      html: true,
      position: 'bottom',
      timeout: 3000,
      classes: 'floww-toast floww-toast--delete',
      actions: [{ label: 'Undo', color: 'white', handler: () => allDeleted.forEach(e => financeStore.expenses.push(e)) }]
    })
  }

  function undoToast(message, onUndo) {
    Notify.create({
      message: `<span class="material-symbols-outlined toast-icon">delete</span> ${escapeHtml(message)}`,
      html: true,
      position: 'bottom',
      timeout: 3000,
      classes: 'floww-toast floww-toast--delete',
      actions: [{ label: 'Undo', color: 'white', handler: onUndo }]
    })
  }

  function deleteIncome(id) {
    const res = accounts.deleteIncome(id)
    if (res.success) undoToast(`${res.removed.name} deleted`, () => accounts.restoreIncome(res.removed))
    return res
  }

  function deleteTransfer(id) {
    const res = accounts.deleteTransfer(id)
    if (res.success) undoToast('Move deleted', () => accounts.restoreTransfer(res.removed))
    return res
  }

  return { markPaid, deleteExpense, deleteIncome, deleteTransfer }
}
