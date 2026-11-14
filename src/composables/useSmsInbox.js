import { ref, computed } from 'vue'
import { format } from 'date-fns'
import { checkSmsPermission, requestSmsPermission, readSmsInbox, isSmsSupported } from '../utils/smsReader'
import { parseSmsList, prettyMerchant } from '../utils/smsParser'
import { reconcileSms } from '../utils/smsReconcile'
import { getBudgetMonth } from '../utils/format'
import { getCategoryIcon } from '../utils/categoryConfig'
import { lastDigits } from '../utils/wallets'
import { useSmsImportStore } from '../stores/smsImportStore'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useCloudSync } from './useCloudSync'

const SENDERS = ['COMBANK', 'COMBNK', 'Nations', 'NTB']

const transactions = ref([])
const scanning = ref(false)
const scanned = ref(false)
const error = ref('')
const needsPermission = ref(false)
let lastScanAt = 0

export function ingestSmsMessages(messages) {
  transactions.value = parseSmsList(messages)
  scanned.value = true
  lastScanAt = Date.now()
}

const noon = date => (date ? new Date(`${date}T12:00:00`).getTime() : 0)

export function useSmsInbox() {
  const smsStore = useSmsImportStore()
  const finance = useFinanceStore()
  const settings = useSettingsStore()
  const accounts = useAccountsStore()
  const cards = useCreditCardStore()
  const { syncNow } = useCloudSync()

  const importedFromExpenses = computed(() => {
    const s = new Set(accounts.ledgerFingerprints)
    for (const e of finance.expenses) if (e.sourceSmsFingerprint) s.add(e.sourceSmsFingerprint)
    return s
  })

  const isImported = fp => importedFromExpenses.value.has(fp) || smsStore.isImported(fp)
  const isSkipped = fp => !isImported(fp) && smsStore.isDismissed(fp)

  const matchRecords = computed(() => {
    const present = new Set(transactions.value.map(t => t.fingerprint))
    const fromHere = fp => fp && present.has(fp)
    const cardTail = id => lastDigits(cards.getCard(id)?.last4)
    const out = []
    for (const e of finance.expenses) {
      if (e.isAggregate || fromHere(e.sourceSmsFingerprint)) continue
      const cardPay = e.category === 'creditCardPayment'
      out.push({
        id: `e:${e.id}`, name: e.name, date: e.dueDate, time: e.at || noon(e.dueDate), amount: e.amount || 0,
        kind: cardPay ? 'card-payment' : 'out', onCard: !!e.paidByCardId,
        card: cardPay ? cardTail(e.cardId) : (e.paidByCardId ? cardTail(e.paidByCardId) : '')
      })
    }
    for (const t of finance.currencyTransfers || []) {
      if (fromHere(t.sourceSmsFingerprint)) continue
      const ends = accounts.transferEnds(t)
      out.push({ id: `t:${t.id}`, name: t.note || 'Move', date: t.date, time: t.at || noon(t.date), amount: ends.sent, kind: 'move' })
      if (Math.abs(ends.received - ends.sent) > 1) out.push({ id: `t:${t.id}:in`, name: t.note || 'Move', date: t.date, time: t.at || noon(t.date), amount: ends.received, kind: 'in' })
    }
    for (const i of accounts.incomes) {
      if (fromHere(i.sourceSmsFingerprint)) continue
      out.push({ id: `i:${i.id}`, name: i.name, date: i.date, time: i.at || noon(i.date), amount: i.amount || 0, kind: 'in' })
    }
    for (const [month, mi] of Object.entries(finance.monthlyIncomes || {})) {
      if (!mi || mi.incomeId || !(Number(mi.usdAmount) > 0) || !mi.receivedDate) continue
      out.push({ id: `s:${month}`, name: 'Salary', date: mi.receivedDate, time: noon(mi.receivedDate), amount: Number(mi.usdAmount), kind: 'in' })
    }
    return out
  })

  const lineOf = last4 => {
    const card = cards.activeCards.find(c => lastDigits(c.last4) === lastDigits(last4))
    return card ? cards.lineKey(card) : `card:${last4}`
  }

  const annotated = computed(() =>
    reconcileSms(transactions.value, { isImported, isRecorded: fp => importedFromExpenses.value.has(fp), lineOf, records: matchRecords.value })
  )

  const open = tx => !tx.hidden && !isImported(tx.fingerprint) && !smsStore.isDismissed(tx.fingerprint)
  const newestFirst = (a, b) => (b.smsDate || 0) - (a.smsDate || 0)

  const fresh = computed(() => annotated.value.filter(tx => open(tx) && !tx.likely).sort(newestFirst))
  const maybe = computed(() => annotated.value.filter(tx => open(tx) && tx.likely).sort(newestFirst))
  const done = computed(() =>
    annotated.value.filter(tx => !tx.hidden && (isImported(tx.fingerprint) || smsStore.isDismissed(tx.fingerprint))).sort(newestFirst)
  )

  async function scan({ ask = false } = {}) {
    if (!isSmsSupported()) {
      error.value = 'Reading bank messages works in the Android app only.'
      scanned.value = true
      return
    }
    if (scanning.value) return
    scanning.value = true
    error.value = ''
    try {
      let perm = await checkSmsPermission()
      if (!perm.granted && ask) perm = await requestSmsPermission()
      if (!perm.granted) {
        needsPermission.value = true
        smsStore.permissionGranted = false
        return
      }
      needsPermission.value = false
      smsStore.permissionGranted = true
      const res = await readSmsInbox({ senders: SENDERS, sinceDays: smsStore.scanRangeDays, limit: 1000 })
      if (res.error) {
        error.value = `Could not read messages: ${res.error}`
        return
      }
      ingestSmsMessages(res.messages)
    } catch (err) {
      error.value = `Could not read messages: ${err?.message || 'unknown error'}`
    } finally {
      scanning.value = false
    }
  }

  function autoScan() {
    if (!isSmsSupported() || Date.now() - lastScanAt < 60000) return
    scan()
  }

  function draft(tx) {
    const edit = smsStore.getPendingEdit(tx.fingerprint)
    if (edit) return { kind: 'expense', ...edit }
    const body = tx.rawBody || ''
    const dueDate = tx.date || format(new Date(tx.smsDate || Date.now()), 'yyyy-MM-dd')
    const notes = `[SMS] ${tx.bankDisplay || tx.senderId || ''} · ${body.slice(0, 120)}${body.length > 120 ? '…' : ''}`
    const card = tx.instrument === 'credit' || tx.card ? accounts.matchCreditCard(tx) : null
    const account = !card && tx.instrument !== 'credit' && accounts.tracking ? accounts.matchSmsAccount(tx) : null

    if (tx.type === 'reversal' && tx.instrument === 'credit') {
      return { kind: 'refund', name: `Refund, ${prettyMerchant(tx.merchant)}`, amount: tx.amount, currency: 'LKR', cardId: card?.id, icon: 'undo', dueDate, notes }
    }

    if (tx.direction === 'in' && (tx.type === 'reversal' || tx.kind === 'reversal' || tx.kind === 'fee-refund' || tx.kind === 'deposit-close')) {
      const name = tx.kind === 'fee-refund' ? 'Bank fee refund' : tx.kind === 'deposit-close' ? 'Fixed deposit returned' : `Refund, ${prettyMerchant(tx.merchant.replace(/POS Reversal Transaction\s*-?\s*/i, ''))}`
      return { kind: 'income', incomeKind: 'other', name, amount: tx.amount, currency: account?.currency || 'LKR', accountId: account?.id, category: 'income', icon: 'undo', dueDate, notes }
    }

    if (tx.kind === 'deposit-fund') {
      const cat = getCategoryIcon('savings', settings.customCategories)
      return {
        kind: 'expense', name: 'Fixed deposit', amount: tx.amount, currency: 'LKR', category: 'savings', icon: cat.icon, iconColor: cat.color,
        dueDate, status: 'paid', accountId: account?.id || undefined, notes
      }
    }

    if (tx.type === 'card-payment') {
      return { kind: 'move', name: `${card ? card.name : 'Card'} payment`, amount: tx.amount, currency: 'LKR', toCardId: card?.id, icon: 'credit_card', dueDate, notes }
    }

    if (tx.pair && (tx.kind === 'own-transfer' || tx.kind === 'bank-transfer')) {
      const to = accounts.tracking
        ? accounts.matchSmsAccount({ ...tx, bank: tx.pair.bank || tx.bank, senderId: tx.pair.bank || tx.senderId, account: tx.pair.account, currency: tx.pair.currency })
        : null
      const exchange = tx.currency === 'USD' && tx.pair.currency === 'LKR'
      return {
        kind: 'move', name: exchange ? 'Dollars to LKR' : `To ${to?.name || 'your other account'}`, amount: tx.amount, toAmount: tx.pair.amount,
        currency: account?.currency || tx.currency, accountId: account?.id, toAccountId: to?.id, icon: exchange ? 'currency_exchange' : 'swap_horiz',
        dueDate, notes, pairFingerprint: tx.pair.fingerprint, toBalance: tx.pair.balance
      }
    }

    if (tx.direction === 'in' && accounts.tracking && account && (tx.fromBank || tx.kind === 'cash-deposit')) {
      const from = tx.kind === 'cash-deposit'
        ? accounts.cashAccount
        : accounts.active.find(a => a.institution === accounts.institutionFor({ bank: tx.fromBank }) && a.currency === account.currency && a.id !== account.id)
      if (from && from.id !== account.id) {
        return {
          kind: 'move', name: tx.kind === 'cash-deposit' ? 'Cash deposit' : `From ${from.name}`, amount: tx.amount, currency: account.currency,
          accountId: from.id, toAccountId: account.id, icon: tx.kind === 'cash-deposit' ? 'payments' : 'swap_horiz', dueDate, notes, toBalance: tx.balance
        }
      }
    }

    if (tx.direction === 'in') {
      const currency = account?.currency || tx.currency || 'LKR'
      const salary = tx.kind === 'remittance' && currency === 'USD'
      const name = salary ? 'Salary'
        : tx.kind === 'interest' ? 'Interest'
          : tx.kind === 'bank-transfer' ? 'Bank transfer in'
            : tx.kind === 'own-transfer' ? 'From your other account'
              : prettyMerchant(tx.merchant) || 'Money in'
      return {
        kind: 'income', incomeKind: salary ? 'salary' : 'other', name, amount: tx.amount, currency,
        accountId: account?.id, category: 'income', icon: salary ? 'work' : 'call_received', dueDate, notes
      }
    }

    if (tx.type === 'withdrawal' && account && accounts.cashAccount && account.id !== accounts.cashAccount.id) {
      return {
        kind: 'move', name: 'Cash withdrawal', amount: tx.amount, currency: account.currency,
        accountId: account.id, toAccountId: accounts.cashAccount.id, category: 'cashWithdrawal', icon: 'local_atm', dueDate, notes
      }
    }

    let category = tx.category || 'others'
    let name = prettyMerchant(tx.via === 'paypal' ? String(tx.merchant || '').replace(/^PAY\s*PAL\s*\*?\s*/i, '') || tx.merchant : tx.merchant) || 'Bank payment'
    if (tx.kind === 'bank-fee') {
      category = 'bills'
      name = /tax/i.test(tx.merchant || '') ? 'Withholding tax' : 'Bank fee'
    } else if (tx.kind === 'bank-transfer') {
      category = 'onlineTransfer'
      name = tx.toBank ? `Transfer to ${prettyMerchant(tx.toBank)}` : 'Bank transfer'
    }
    const cat = getCategoryIcon(category, settings.customCategories)
    const rate = Number(settings.fxRate?.usdToLkr) || 0
    const foreign = tx.currency && tx.currency !== 'LKR'
    let amount = tx.amount
    if (foreign) {
      if (tx.lkrAmount) amount = tx.lkrAmount
      else if (tx.currency === 'USD' && rate) amount = Math.round(tx.amount * rate)
    }
    const estimated = foreign && !tx.lkrAmount
    return {
      kind: 'expense',
      name,
      amount,
      usdAmount: tx.currency === 'USD' ? tx.amount : undefined,
      currency: 'LKR',
      category,
      icon: cat.icon,
      iconColor: cat.color,
      dueDate,
      status: 'paid',
      paidByCardId: card?.id || undefined,
      accountId: account?.id || undefined,
      paidFromCash: account?.wallet === 'cash' || undefined,
      via: account && tx.via === 'paypal' && account.paypal ? 'paypal' : undefined,
      notes: foreign ? `${notes} · ${tx.currency} ${tx.amount}${estimated ? ', rupee amount estimated' : ''}` : notes
    }
  }

  function smsBalanceFor(tx, accountId) {
    if (!accountId || typeof tx.balance !== 'number' || tx.balanceKind !== 'account') return undefined
    return { accountId, amount: tx.balance, at: tx.smsDate || Date.now() }
  }

  function add(tx, edit) {
    const e = edit || draft(tx)
    const kind = e.kind || 'expense'
    const dueDate = e.dueDate || format(new Date(), 'yyyy-MM-dd')
    const at = tx.smsDate || undefined
    let ok = false

    if (kind === 'refund') {
      if (!e.cardId) return false
      ok = !!finance.addExpense({
        name: e.name, amount: e.amount, category: 'creditCardPayment', icon: 'undo', iconColor: '#C0C1FF',
        dueDate, monthYear: getBudgetMonth(dueDate), status: 'paid', isRecurring: false, isInstallment: false,
        cardId: e.cardId, refund: true, notes: e.notes || undefined, at, sourceSmsFingerprint: tx.fingerprint
      })?.success
    } else if (kind === 'income') {
      ok = accounts.addIncome({
        accountId: e.accountId,
        amount: e.amount,
        name: e.name,
        kind: e.incomeKind || 'other',
        date: dueDate,
        at,
        note: e.note || '',
        sourceSmsFingerprint: tx.fingerprint,
        smsBalance: smsBalanceFor(tx, e.accountId)
      }).success
    } else if (kind === 'move' && e.toCardId) {
      if (!e.accountId) return false
      const card = cards.getCard(e.toCardId)
      ok = !!finance.addExpense({
        name: card ? `${card.name} payment` : 'Card payment',
        amount: e.toAmount || e.amount,
        category: 'creditCardPayment',
        icon: 'credit_card',
        iconColor: card?.color || '#C0C1FF',
        dueDate,
        monthYear: getBudgetMonth(dueDate),
        status: 'paid',
        isRecurring: false,
        isInstallment: false,
        cardId: e.toCardId,
        accountId: e.accountId,
        notes: e.note || undefined,
        at,
        smsBalance: smsBalanceFor(tx, e.accountId),
        sourceSmsFingerprint: tx.fingerprint
      })?.success
    } else if (kind === 'move') {
      ok = accounts.addTransfer({
        fromAccountId: e.accountId,
        toAccountId: e.toAccountId,
        amount: e.amount,
        toAmount: e.toAmount,
        date: dueDate,
        at,
        note: e.name === 'Cash withdrawal' ? 'ATM withdrawal' : (e.note || ''),
        sourceSmsFingerprint: tx.fingerprint,
        pairedSmsFingerprint: e.pairFingerprint,
        smsBalance: tx.direction === 'out' ? smsBalanceFor(tx, e.accountId) : undefined,
        toSmsBalance: e.toAccountId && typeof e.toBalance === 'number' ? { accountId: e.toAccountId, amount: e.toBalance, at: at || Date.now() } : undefined
      }).success
    } else {
      if (accounts.tracking && !e.accountId && !e.paidByCardId && !e.paidFromCash) return false
      const result = finance.addExpense({
        name: e.name,
        amount: e.amount,
        usdAmount: typeof e.usdAmount === 'number' ? e.usdAmount : undefined,
        category: e.category,
        icon: e.icon,
        iconColor: e.iconColor,
        dueDate,
        monthYear: getBudgetMonth(dueDate),
        status: e.status || 'paid',
        isRecurring: false,
        isInstallment: false,
        accountId: e.accountId || undefined,
        via: e.via || undefined,
        paidFromCash: e.paidFromCash || undefined,
        paidByCardId: e.paidByCardId || undefined,
        notes: e.notes || undefined,
        at,
        smsBalance: e.paidByCardId ? undefined : smsBalanceFor(tx, e.accountId),
        sourceSmsFingerprint: tx.fingerprint
      })
      ok = !!result?.success
      if (ok && e.category && e.category !== tx.category && !tx.kind) smsStore.learnMerchantCategory(tx.merchant, e.category)
    }
    if (!ok) return false
    smsStore.markImported(tx.fingerprint)
    if (e.pairFingerprint) smsStore.markImported(e.pairFingerprint)
    smsStore.clearPendingEdit(tx.fingerprint)
    return true
  }

  function addOne(tx, edit) {
    const ok = add(tx, edit)
    if (ok) syncNow()
    return ok
  }

  async function addAll() {
    let added = 0
    let failed = 0
    for (const tx of [...fresh.value].sort((a, b) => (a.smsDate || 0) - (b.smsDate || 0))) add(tx) ? added++ : failed++
    if (added) {
      try { await syncNow() } catch {}
    }
    return { added, failed }
  }

  function skip(tx) {
    smsStore.dismiss(tx.fingerprint)
  }

  function skipAll() {
    const list = [...fresh.value]
    list.forEach(skip)
    return list.length
  }

  function restore(tx) {
    smsStore.undismiss(tx.fingerprint)
  }

  return {
    transactions, annotated, fresh, maybe, done, scanning, scanned, error, needsPermission,
    isImported, isSkipped, scan, autoScan, draft, addOne, addAll, skip, skipAll, restore
  }
}
