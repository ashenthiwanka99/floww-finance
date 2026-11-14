import { format } from 'date-fns'
import { useAccountsStore } from '../stores/accountsStore'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { getBudgetMonth } from '../utils/format'
import { round2 } from '../utils/wallets'

const idOf = v => String(v || '').replace(/^(acct|paypal|card):/, '')

export function blankIncome(accounts, kind = 'other') {
  const acct = kind === 'salary' ? (accounts.defaultUsd || accounts.defaultLkr) : (accounts.defaultLkr || accounts.defaultUsd)
  return {
    kind,
    account: acct ? `acct:${acct.id}` : '',
    amount: null,
    name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    note: ''
  }
}

export function blankMove(accounts, preset = 'exchange') {
  const lkr = accounts.accountsIn('lkr')
  const pick = a => (a ? `acct:${a.id}` : '')
  const cards = useCreditCardStore().activeCards || []
  const ends = {
    exchange: [pick(accounts.defaultUsd), pick(accounts.defaultLkr)],
    cash: [pick(accounts.defaultLkr), pick(accounts.cashAccount)],
    card: [pick(accounts.defaultLkr), cards[0] ? `card:${cards[0].id}` : ''],
    banks: [pick(lkr[0]), pick(lkr[1])]
  }[preset] || ['', '']
  return {
    preset,
    from: ends[0],
    to: ends[1],
    amount: null,
    toAmount: null,
    date: format(new Date(), 'yyyy-MM-dd'),
    note: ''
  }
}

export function useMoneyRecords() {
  const accounts = useAccountsStore()
  const finance = useFinanceStore()
  const cards = useCreditCardStore()

  function validateIncome(form) {
    const errors = {}
    if (!accounts.getAccount(idOf(form.account))) errors.account = 'Pick the account it went into'
    if (!(Number(form.amount) > 0)) errors.amount = 'Enter the amount'
    if (!form.date) errors.date = 'Pick the date'
    return errors
  }

  function saveIncome(form, existingId = null, extra = {}) {
    const errors = validateIncome(form)
    if (Object.keys(errors).length) return { success: false, errors }
    const payload = {
      kind: form.kind,
      accountId: idOf(form.account),
      amount: Number(form.amount),
      name: form.name,
      date: form.date,
      note: form.note,
      ...extra
    }
    const res = existingId ? accounts.updateIncome(existingId, payload) : accounts.addIncome(payload)
    return res.success ? res : { success: false, errors: { form: res.error || 'Could not save that' } }
  }

  function moveEnds(form) {
    const from = accounts.getAccount(idOf(form.from))
    const toCard = String(form.to || '').startsWith('card:') ? cards.getCard(idOf(form.to)) : null
    const to = toCard ? null : accounts.getAccount(idOf(form.to))
    const toCurrency = toCard ? 'LKR' : to?.currency
    return { from, to, toCard, toCurrency, sameCurrency: !!from && !!toCurrency && from.currency === toCurrency }
  }

  function validateMove(form) {
    const errors = {}
    const { from, to, toCard, sameCurrency } = moveEnds(form)
    if (!from) errors.from = 'Pick where the money left'
    if (!to && !toCard) errors.to = 'Pick where it went'
    if (from && to && from.id === to.id) errors.to = 'Pick a different account'
    if (!(Number(form.amount) > 0)) errors.amount = 'Enter the amount'
    if (from && (to || toCard) && !sameCurrency && !(Number(form.toAmount) > 0)) errors.toAmount = 'Enter what arrived'
    if (!form.date) errors.date = 'Pick the date'
    return errors
  }

  async function saveMove(form, existing = null, extra = {}) {
    const errors = validateMove(form)
    if (Object.keys(errors).length) return { success: false, errors }
    const { from, to, toCard, sameCurrency } = moveEnds(form)
    const amount = round2(form.amount)
    const received = sameCurrency ? amount : round2(form.toAmount)

    if (toCard) {
      const payment = {
        name: `${toCard.name} payment`,
        amount: received,
        category: 'creditCardPayment',
        icon: 'credit_card',
        iconColor: toCard.color || '#C0C1FF',
        dueDate: form.date,
        monthYear: getBudgetMonth(form.date),
        status: 'paid',
        isRecurring: false,
        isInstallment: false,
        cardId: toCard.id,
        accountId: from.id,
        paidFromCash: from.wallet === 'cash' || undefined,
        usdAmount: from.currency === 'USD' ? amount : undefined,
        notes: form.note?.trim() || undefined,
        ...extra
      }
      if (existing?.kind === 'expense') return await finance.updateExpense(existing.id, payment)
      if (existing?.kind === 'transfer') accounts.deleteTransfer(existing.id)
      return finance.addExpense(payment)
    }

    const data = {
      fromAccountId: from.id,
      toAccountId: to.id,
      amount,
      toAmount: received,
      date: form.date,
      note: form.note,
      ...extra
    }
    if (existing?.kind === 'transfer') {
      const res = accounts.updateTransfer(existing.id, data)
      return res.success ? res : { success: false, errors: { form: res.error || 'Could not save that' } }
    }
    if (existing?.kind === 'expense') finance.deleteExpense(existing.id)
    const res = accounts.addTransfer(data)
    return res.success ? res : { success: false, errors: { form: res.error || 'Could not save that' } }
  }

  return { validateIncome, saveIncome, validateMove, saveMove, moveEnds }
}
