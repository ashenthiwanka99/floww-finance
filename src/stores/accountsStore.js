import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { format } from 'date-fns'
import { capacitorStorage } from '../utils/capacitorStorage'
import { getBudgetMonth, suggestBudgetMonth, getSalaryAnchors } from '../utils/format'
import { WALLETS, effectiveAt, round2, lastDigits } from '../utils/wallets'
import { useFinanceStore } from './financeStore'
import { useSettingsStore } from './settingsStore'
import { useCreditCardStore } from './creditCardStore'

const NOT_BILLS = ['savings', 'cashWithdrawal', 'lend']
const today = () => format(new Date(), 'yyyy-MM-dd')

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref([])
  const incomes = ref([])
  const corrections = ref([])
  const setupComplete = ref(false)
  const lastSource = ref(null)

  const finance = useFinanceStore()
  const settings = useSettingsStore()
  const cards = useCreditCardStore()

  const active = computed(() =>
    accounts.value
      .filter(a => !a.archived)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  )
  const byId = computed(() => new Map(accounts.value.map(a => [a.id, a])))
  const getAccount = id => (id ? byId.value.get(id) || null : null)
  const accountsIn = wallet => active.value.filter(a => a.wallet === wallet)

  const cashAccount = computed(() => accountsIn('cash')[0] || null)
  const defaultUsd = computed(() => accountsIn('usd')[0] || null)
  const defaultLkr = computed(() => accountsIn('lkr')[0] || null)
  const tracking = computed(() => setupComplete.value && active.value.some(a => a.openingAt))
  const fxRate = computed(() => Number(settings.fxRate?.usdToLkr) || 0)

  function normalizeCards(list) {
    const raw = Array.isArray(list) ? list : String(list || '').split(/[\s,]+/)
    return [...new Set(raw.map(v => lastDigits(v)).filter(v => v.length === 4))]
  }

  function addAccount(data) {
    const name = String(data?.name || '').trim()
    const wallet = WALLETS.find(w => w.key === data?.wallet)
    if (!name) return { success: false, error: 'Give the account a name' }
    if (!wallet) return { success: false, error: 'Pick a wallet' }
    const now = Date.now()
    const hasOpening = data.openingBalance !== null && data.openingBalance !== undefined && data.openingBalance !== ''
    const account = {
      id: uuidv4(),
      name,
      wallet: wallet.key,
      currency: wallet.currency,
      institution: data.institution || (wallet.key === 'cash' ? 'cash' : 'other'),
      numberLast4: lastDigits(data.numberLast4),
      cardLast4: normalizeCards(data.cardLast4),
      paypal: wallet.currency === 'LKR' && !!data.paypal,
      openingBalance: hasOpening ? round2(data.openingBalance) : null,
      openingAt: hasOpening ? (data.openingAt || now) : null,
      checkedAt: null,
      checkedBalance: null,
      archived: false,
      order: data.order ?? accounts.value.length,
      createdAt: now,
      updatedAt: now
    }
    accounts.value.push(account)
    return { success: true, id: account.id }
  }

  function updateAccount(id, patch) {
    const a = getAccount(id)
    if (!a) return { success: false }
    if (patch.name !== undefined) {
      const name = String(patch.name).trim()
      if (!name) return { success: false, error: 'Give the account a name' }
      a.name = name
    }
    if (patch.institution !== undefined) a.institution = patch.institution
    if (patch.numberLast4 !== undefined) a.numberLast4 = lastDigits(patch.numberLast4)
    if (patch.cardLast4 !== undefined) a.cardLast4 = normalizeCards(patch.cardLast4)
    if (patch.paypal !== undefined) a.paypal = a.currency === 'LKR' && !!patch.paypal
    if (patch.order !== undefined) a.order = patch.order
    if (patch.archived !== undefined) a.archived = !!patch.archived
    if (patch.openingBalance !== undefined && patch.openingBalance !== null && patch.openingBalance !== '') {
      a.openingBalance = round2(patch.openingBalance)
      if (!a.openingAt) a.openingAt = Date.now()
    }
    a.updatedAt = Date.now()
    return { success: true }
  }

  function isUsed(id) {
    return finance.expenses.some(e => e.accountId === id || e.toAccountId === id || e.collectedAccountId === id) ||
      (finance.currencyTransfers || []).some(t => t.fromAccountId === id || t.toAccountId === id) ||
      incomes.value.some(i => i.accountId === id) ||
      corrections.value.some(c => c.accountId === id)
  }

  function removeAccount(id) {
    const a = getAccount(id)
    if (!a) return { success: false }
    if (isUsed(id)) {
      a.archived = true
      a.updatedAt = Date.now()
      return { success: true, archived: true }
    }
    accounts.value = accounts.value.filter(x => x.id !== id)
    return { success: true, archived: false }
  }

  function amountIn(e, account) {
    if (account?.currency === 'USD') {
      if (typeof e.usdAmount === 'number') return e.usdAmount
      const rate = Number(e.fxRate) || fxRate.value
      return rate > 0 ? round2((e.amount || 0) / rate) : 0
    }
    return e.amount || 0
  }

  function expenseAccountId(e) {
    if (!e || e.paidByCardId) return null
    if (e.accountId) return e.accountId
    if (e.paidFromCash) return cashAccount.value?.id || null
    return null
  }

  function transferEnds(t) {
    return {
      from: t.fromAccountId || (Number(t.usdAmount) > 0 ? defaultUsd.value?.id : null) || null,
      to: t.toAccountId || (Number(t.lkrAmount) > 0 ? defaultLkr.value?.id : null) || null,
      sent: typeof t.amount === 'number' ? t.amount : (Number(t.usdAmount) || 0),
      received: typeof t.toAmount === 'number' ? t.toAmount : (Number(t.lkrAmount) || 0)
    }
  }

  const isExchange = t => Number(t?.usdAmount) > 0 && Number(t?.lkrAmount) > 0

  const ledger = computed(() => {
    const map = new Map()
    const push = (id, m) => {
      if (!id || !byId.value.has(id)) return
      if (!map.has(id)) map.set(id, [])
      map.get(id).push(m)
    }
    for (const e of finance.expenses) {
      if (e.status !== 'paid') continue
      const at = e.paidAt || e.at || effectiveAt(e.dueDate, null, e.createdAt)
      const src = expenseAccountId(e)
      if (src) push(src, { type: 'expense', id: e.id, at, date: e.dueDate, amount: -amountIn(e, getAccount(src)), item: e })
      if (e.category === 'cashWithdrawal' && e.accountId) {
        push(e.toAccountId || cashAccount.value?.id, { type: 'cash-in', id: e.id, at, date: e.dueDate, amount: e.amount || 0, item: e, other: e.accountId })
      }
      if (e.category === 'lend' && e.collected && e.collectedAccountId) {
        const cat = e.collectedAt || at
        push(e.collectedAccountId, { type: 'collected', id: e.id, at: cat, date: format(new Date(cat), 'yyyy-MM-dd'), amount: e.amount || 0, item: e })
      }
    }
    for (const t of finance.currencyTransfers || []) {
      const { from, to, sent, received } = transferEnds(t)
      const at = t.at || effectiveAt(t.date, null, t.createdAt)
      push(from, { type: 'transfer-out', id: t.id, at, date: t.date, amount: -sent, item: t, other: to })
      push(to, { type: 'transfer-in', id: t.id, at, date: t.date, amount: received, item: t, other: from })
    }
    for (const i of incomes.value) {
      push(i.accountId, { type: 'income', id: i.id, at: i.at || effectiveAt(i.date, null, i.createdAt), date: i.date, amount: i.amount || 0, item: i })
    }
    for (const [month, mi] of Object.entries(finance.monthlyIncomes || {})) {
      if (!mi || mi.incomeId || !(Number(mi.usdAmount) > 0) || !mi.receivedDate) continue
      push(mi.accountId || defaultUsd.value?.id, {
        type: 'salary', id: `salary:${month}`, at: effectiveAt(mi.receivedDate, null, null),
        date: mi.receivedDate, amount: Number(mi.usdAmount), item: { ...mi, month }
      })
    }
    for (const c of corrections.value) {
      push(c.accountId, { type: 'correction', id: c.id, at: c.at, date: c.date, amount: c.amount || 0, item: c })
    }
    for (const d of finance.loanDisbursements || []) {
      if (d?.accountId) push(d.accountId, { type: 'loan', id: d.id, at: d.at || effectiveAt(d.date, null, d.createdAt), date: d.date, amount: d.amount || 0, item: d })
    }
    for (const list of map.values()) list.sort((a, b) => a.at - b.at)
    return map
  })

  const balances = computed(() => {
    const out = {}
    for (const a of accounts.value) {
      if (!a.openingAt) { out[a.id] = null; continue }
      let b = Number(a.openingBalance) || 0
      for (const m of ledger.value.get(a.id) || []) if (m.at > a.openingAt) b += m.amount
      out[a.id] = round2(b)
    }
    return out
  })

  const balanceOf = id => balances.value[id] ?? null

  function balanceAt(id, ts) {
    const a = getAccount(id)
    if (!a?.openingAt || ts < a.openingAt) return null
    let b = Number(a.openingBalance) || 0
    for (const m of ledger.value.get(id) || []) {
      if (m.at <= a.openingAt) continue
      if (m.at > ts) break
      b += m.amount
    }
    return round2(b)
  }

  function historyOf(id) {
    const a = getAccount(id)
    if (!a) return []
    const list = (ledger.value.get(id) || []).filter(m => !a.openingAt || m.at > a.openingAt)
    let running = Number(a.openingBalance) || 0
    return list.map(m => {
      running = round2(running + m.amount)
      return { ...m, balance: a.openingAt ? running : null }
    }).reverse()
  }

  const walletTotals = computed(() => {
    const totals = { lkr: 0, usd: 0, cash: 0 }
    const unset = { lkr: 0, usd: 0, cash: 0 }
    const count = { lkr: 0, usd: 0, cash: 0 }
    for (const a of active.value) {
      count[a.wallet]++
      const b = balances.value[a.id]
      if (b === null || b === undefined) unset[a.wallet]++
      else totals[a.wallet] = round2(totals[a.wallet] + b)
    }
    return { ...totals, unset, count }
  })

  const spendable = computed(() => round2(walletTotals.value.lkr + walletTotals.value.cash))
  const totalInLkr = computed(() => round2(spendable.value + walletTotals.value.usd * fxRate.value))

  const smsEvidence = computed(() => {
    const map = new Map()
    const consider = (rec, at) => {
      for (const s of [rec?.smsBalance, rec?.toSmsBalance]) {
        if (!s || !s.accountId || typeof s.amount !== 'number') continue
        const when = s.at || at
        const prev = map.get(s.accountId)
        if (!prev || when > prev.at) map.set(s.accountId, { at: when, balance: s.amount, source: 'sms', label: rec.name || rec.note || '' })
      }
    }
    for (const e of finance.expenses) if (e.status === 'paid') consider(e, e.at || e.paidAt)
    for (const i of incomes.value) consider(i, i.at)
    for (const t of finance.currencyTransfers || []) consider(t, t.at)
    return map
  })

  function statusOf(id) {
    const a = getAccount(id)
    if (!a) return { state: 'missing' }
    if (!a.openingAt) return { state: 'unset' }
    const candidates = []
    if (a.checkedAt && typeof a.checkedBalance === 'number') candidates.push({ at: a.checkedAt, balance: a.checkedBalance, source: 'check' })
    const sms = smsEvidence.value.get(id)
    if (sms && sms.at > a.openingAt) candidates.push(sms)
    if (!candidates.length) return { state: 'unchecked', since: a.openingAt }
    const latest = candidates.sort((x, y) => y.at - x.at)[0]
    const app = balanceAt(id, latest.at)
    if (app === null) return { state: 'unchecked', since: a.openingAt }
    const diff = round2(latest.balance - app)
    return { state: Math.abs(diff) < 1 ? 'matched' : 'off', diff, at: latest.at, bank: latest.balance, app, source: latest.source, label: latest.label }
  }

  const offAccounts = computed(() =>
    active.value.map(a => ({ account: a, status: statusOf(a.id) })).filter(x => x.status.state === 'off')
  )

  function checkBalance(id, bankBalance, at = Date.now()) {
    const a = getAccount(id)
    if (!a) return null
    const amount = round2(bankBalance)
    if (!a.openingAt) {
      a.openingBalance = amount
      a.openingAt = at
      a.checkedAt = at
      a.checkedBalance = amount
      a.updatedAt = Date.now()
      return { app: amount, diff: 0, opened: true }
    }
    const app = balanceAt(id, at)
    a.checkedAt = at
    a.checkedBalance = amount
    a.updatedAt = Date.now()
    return { app, diff: round2(amount - (app || 0)) }
  }

  function addCorrection(data) {
    const a = getAccount(data?.accountId)
    const amount = round2(data?.amount)
    if (!a || !amount) return { success: false }
    const at = data.at || Date.now()
    const date = format(new Date(at), 'yyyy-MM-dd')
    const now = Date.now()
    const c = {
      id: uuidv4(), accountId: a.id, amount, at, date,
      monthYear: getBudgetMonth(date), note: String(data.note || '').trim(),
      createdAt: now, updatedAt: now
    }
    corrections.value.push(c)
    return { success: true, id: c.id }
  }

  function deleteCorrection(id) {
    corrections.value = corrections.value.filter(c => c.id !== id)
    return { success: true }
  }

  function nextCycleFor(date) {
    const anchors = getSalaryAnchors()
    const same = anchors.find(a => a.receivedDate === date)
    if (same) return same.monthYear
    const newest = anchors[anchors.length - 1]
    if (newest && date < newest.receivedDate) return null
    return suggestBudgetMonth(date)
  }

  function rebucket(fromMonth, toMonth, fromDate) {
    if (!fromMonth || !toMonth || fromMonth === toMonth || !fromDate) return 0
    const now = Date.now()
    let moved = 0
    for (const e of finance.expenses) {
      if (e.monthYear !== fromMonth || e.scheduleId || e.isRecurring || (e.dueDate || '') < fromDate) continue
      if (e.isInstallment && e.status === 'paid') continue
      e.monthYear = toMonth
      e.updatedAt = now
      moved++
    }
    for (const t of finance.currencyTransfers || []) {
      if (t.monthYear === fromMonth && (t.date || '') >= fromDate) { t.monthYear = toMonth; t.updatedAt = now; moved++ }
    }
    for (const list of [incomes.value, corrections.value]) {
      for (const x of list) {
        if (x.monthYear === fromMonth && x.kind !== 'salary' && (x.date || '') >= fromDate) { x.monthYear = toMonth; x.updatedAt = now; moved++ }
      }
    }
    for (const d of finance.loanDisbursements || []) {
      if (d?.monthYear === fromMonth && (d.date || '') >= fromDate) { d.monthYear = toMonth; moved++ }
    }
    return moved
  }

  function rebaseOpening(id, balance, at) {
    const a = getAccount(id)
    if (!a || typeof balance !== 'number' || !at) return { success: false }
    a.openingBalance = round2(balance)
    a.openingAt = at
    a.checkedAt = at
    a.checkedBalance = round2(balance)
    a.updatedAt = Date.now()
    return { success: true }
  }

  function anchorSalary(entry, account) {
    if (!entry.cycleMonth || !account) return
    const before = getBudgetMonth(entry.date)
    const prev = finance.monthlyIncomes[entry.cycleMonth] || {}
    const rate = Number(prev.fxRate) || fxRate.value
    const usd = account.currency === 'USD' ? entry.amount : (rate ? round2(entry.amount / rate) : 0)
    finance.setMonthlyIncome(entry.cycleMonth, {
      ...prev,
      usdAmount: usd,
      fxRate: rate,
      lkrSalary: account.currency === 'LKR' ? entry.amount : round2(usd * rate),
      sideIncome: prev.sideIncome || 0,
      total: 0,
      receivedDate: entry.date,
      salaryReceivedMonth: entry.date.slice(0, 7),
      budgetSource: 'transfers',
      accountId: account.id,
      incomeId: entry.id,
      date: Date.now()
    })
    if (before !== entry.cycleMonth) rebucket(before, entry.cycleMonth, entry.date)
  }

  const salaryWaiting = computed(() => {
    const anchors = getSalaryAnchors()
    const newest = anchors[anchors.length - 1]
    const last = newest ? Number(finance.monthlyIncomes[newest.monthYear]?.usdAmount) || 0 : 0
    return incomes.value
      .filter(i => i.kind === 'other' && i.currency === 'USD' && (!newest || i.date > newest.receivedDate))
      .filter(i => /salary|inward|remit/i.test(i.name) || (last > 0 && Math.abs(i.amount - last) <= last * 0.15))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null
  })

  function unanchorSalary(entry) {
    const mi = entry?.cycleMonth ? finance.monthlyIncomes[entry.cycleMonth] : null
    if (!mi || mi.incomeId !== entry.id) return
    const next = { ...mi, usdAmount: 0, lkrSalary: 0, total: 0 }
    delete next.incomeId
    finance.setMonthlyIncome(entry.cycleMonth, next)
  }

  function addIncome(data) {
    const account = getAccount(data?.accountId)
    const amount = round2(data?.amount)
    if (!account) return { success: false, error: 'Pick the account it went into' }
    if (!(amount > 0)) return { success: false, error: 'Enter the amount' }
    const date = data.date || today()
    const kind = data.kind === 'salary' ? 'salary' : 'other'
    const now = Date.now()
    const entry = {
      id: uuidv4(),
      date,
      at: data.at || undefined,
      accountId: account.id,
      amount,
      currency: account.currency,
      name: String(data.name || '').trim() || (kind === 'salary' ? 'Salary' : 'Money in'),
      kind,
      note: String(data.note || '').trim(),
      monthYear: getBudgetMonth(date),
      sourceSmsFingerprint: data.sourceSmsFingerprint || undefined,
      smsBalance: data.smsBalance || undefined,
      createdAt: now,
      updatedAt: now
    }
    if (kind === 'salary') {
      entry.cycleMonth = data.cycleMonth || nextCycleFor(date)
      anchorSalary(entry, account)
      if (entry.cycleMonth) entry.monthYear = entry.cycleMonth
    }
    incomes.value.push(entry)
    if (kind === 'salary') finance.syncBudgetMonth()
    return { success: true, id: entry.id, entry }
  }

  function updateIncome(id, patch) {
    const i = incomes.value.find(x => x.id === id)
    if (!i) return { success: false }
    if (patch.accountId !== undefined) {
      const a = getAccount(patch.accountId)
      if (!a) return { success: false, error: 'Pick the account it went into' }
      i.accountId = a.id
      i.currency = a.currency
    }
    if (patch.amount !== undefined) {
      const v = round2(patch.amount)
      if (!(v > 0)) return { success: false, error: 'Enter the amount' }
      i.amount = v
    }
    if (patch.date) i.date = patch.date
    if (patch.name !== undefined) i.name = String(patch.name).trim() || i.name
    if (patch.note !== undefined) i.note = String(patch.note || '').trim()
    if (patch.kind !== undefined && patch.kind !== i.kind) {
      if (patch.kind === 'salary') {
        i.kind = 'salary'
        i.cycleMonth = nextCycleFor(i.date)
      } else {
        unanchorSalary(i)
        i.kind = 'other'
        delete i.cycleMonth
      }
    }
    i.updatedAt = Date.now()
    if (i.kind === 'salary' && i.cycleMonth) {
      anchorSalary(i, getAccount(i.accountId))
      i.monthYear = i.cycleMonth
      finance.syncBudgetMonth()
    } else {
      i.monthYear = getBudgetMonth(i.date)
    }
    return { success: true }
  }

  function deleteIncome(id) {
    const i = incomes.value.find(x => x.id === id)
    if (!i) return { success: false }
    if (i.kind === 'salary') unanchorSalary(i)
    incomes.value = incomes.value.filter(x => x.id !== id)
    return { success: true, removed: i }
  }

  function restoreIncome(entry) {
    if (!entry?.id || incomes.value.some(x => x.id === entry.id)) return
    incomes.value.push(entry)
    if (entry.kind === 'salary' && entry.cycleMonth) {
      anchorSalary(entry, getAccount(entry.accountId))
      finance.syncBudgetMonth()
    }
  }

  function buildTransfer(data, base = {}) {
    const from = getAccount(data?.fromAccountId)
    const to = getAccount(data?.toAccountId)
    if (!from || !to) return { error: 'Pick both accounts' }
    if (from.id === to.id) return { error: 'Pick two different accounts' }
    const amount = round2(data.amount)
    if (!(amount > 0)) return { error: 'Enter the amount sent' }
    const toAmount = from.currency === to.currency ? amount : round2(data.toAmount)
    if (!(toAmount > 0)) return { error: `Enter the ${to.currency === 'USD' ? 'dollars' : 'rupees'} received` }
    const date = data.date || base.date || today()
    const t = {
      ...base,
      date,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount,
      toAmount,
      monthYear: getBudgetMonth(date),
      note: String(data.note ?? base.note ?? '').trim(),
      updatedAt: Date.now(),
      _updatedAt: Date.now()
    }
    if (data.at !== undefined) t.at = data.at || undefined
    if (from.currency === 'USD' && to.currency === 'LKR') {
      t.usdAmount = amount
      t.lkrAmount = toAmount
    } else {
      delete t.usdAmount
      delete t.lkrAmount
    }
    return { transfer: t }
  }

  function addTransfer(data) {
    const now = Date.now()
    const { transfer, error } = buildTransfer(data, { id: uuidv4(), createdAt: now })
    if (error) return { success: false, error }
    if (data.sourceSmsFingerprint) transfer.sourceSmsFingerprint = data.sourceSmsFingerprint
    if (data.pairedSmsFingerprint) transfer.pairedSmsFingerprint = data.pairedSmsFingerprint
    if (data.smsBalance) transfer.smsBalance = data.smsBalance
    if (data.toSmsBalance) transfer.toSmsBalance = data.toSmsBalance
    finance.currencyTransfers.push(transfer)
    return { success: true, id: transfer.id }
  }

  function updateTransfer(id, data) {
    const idx = (finance.currencyTransfers || []).findIndex(t => t.id === id)
    if (idx === -1) return { success: false }
    const old = finance.currencyTransfers[idx]
    const ends = transferEnds(old)
    const { transfer, error } = buildTransfer({
      fromAccountId: data.fromAccountId ?? ends.from,
      toAccountId: data.toAccountId ?? ends.to,
      amount: data.amount ?? ends.sent,
      toAmount: data.toAmount ?? ends.received,
      date: data.date,
      note: data.note
    }, old)
    if (error) return { success: false, error }
    finance.currencyTransfers.splice(idx, 1, transfer)
    return { success: true }
  }

  function deleteTransfer(id) {
    const t = (finance.currencyTransfers || []).find(x => x.id === id)
    if (!t) return { success: false }
    finance.deleteCurrencyTransfer(id)
    return { success: true, removed: t }
  }

  function restoreTransfer(t) {
    if (!t?.id || finance.currencyTransfers.some(x => x.id === t.id)) return
    finance.currencyTransfers.push(t)
  }

  function sourceOf(e) {
    if (e?.paidByCardId) return `card:${e.paidByCardId}`
    if (e?.accountId && getAccount(e.accountId)) return e.via === 'paypal' ? `paypal:${e.accountId}` : `acct:${e.accountId}`
    if (e?.paidFromCash) return cashAccount.value ? `acct:${cashAccount.value.id}` : 'cash'
    return tracking.value ? '' : 'bank'
  }

  function applySource(value) {
    const v = String(value || '')
    if (v.startsWith('card:')) return { accountId: null, paidByCardId: v.slice(5), paidFromCash: false, via: null }
    if (v.startsWith('acct:') || v.startsWith('paypal:')) {
      const id = v.slice(v.indexOf(':') + 1)
      const a = getAccount(id)
      return { accountId: id, paidByCardId: null, paidFromCash: a?.wallet === 'cash', via: v.startsWith('paypal:') ? 'paypal' : null }
    }
    if (v === 'cash') return { accountId: null, paidByCardId: null, paidFromCash: true, via: null }
    return { accountId: null, paidByCardId: null, paidFromCash: false, via: null }
  }

  function defaultSource({ accountsOnly = false } = {}) {
    const last = lastSource.value
    if (last) {
      const parsed = applySource(last)
      const ok = parsed.paidByCardId
        ? !accountsOnly && cards.getCard(parsed.paidByCardId) && cards.getCard(parsed.paidByCardId).active !== false
        : parsed.accountId && getAccount(parsed.accountId) && !getAccount(parsed.accountId).archived
      if (ok) return last
    }
    if (defaultLkr.value) return `acct:${defaultLkr.value.id}`
    return tracking.value ? '' : 'bank'
  }

  function sourceLabel(e) {
    if (e?.paidByCardId) {
      const c = cards.getCard(e.paidByCardId)
      return c ? c.name : 'Card'
    }
    const a = getAccount(expenseAccountId(e))
    if (!a) return e?.paidFromCash ? 'Cash' : ''
    return e.via === 'paypal' ? `PayPal, ${a.name}` : a.name
  }

  function rememberSource(value) {
    if (value && value !== 'bank') lastSource.value = value
  }

  finance.setDefaultPaySource(() => (tracking.value ? applySource(defaultSource({ accountsOnly: true })) : null))

  function institutionFor(tx) {
    const sender = `${tx?.senderId || ''} ${tx?.bank || ''}`
    if (/Nations|NTB/i.test(sender)) return 'ntb'
    if (/COMBANK|COMBNK|Commercial/i.test(sender)) return 'combank'
    return null
  }

  function matchSmsAccount(tx) {
    const inst = institutionFor(tx)
    if (!inst) return null
    const list = active.value.filter(a => a.institution === inst)
    if (!list.length) return null
    const accountTail = lastDigits(tx.account)
    if (accountTail) {
      const hit = list.find(a => a.numberLast4 && a.numberLast4 === accountTail)
      if (hit) return hit
    }
    const cardTail = lastDigits(tx.card)
    if (cardTail) {
      const hit = list.find(a => (a.cardLast4 || []).includes(cardTail))
      if (hit) return hit
    }
    const currency = tx.currency || 'LKR'
    return list.find(a => a.currency === currency) || null
  }

  function matchCreditCard(tx) {
    const tail = lastDigits(tx?.card)
    if (tail) {
      const hit = cards.activeCards.find(c => (c.last4 || '').slice(-4) === tail)
      if (hit) return hit
    }
    if (tx?.instrument === 'credit') {
      const inst = institutionFor(tx)
      const same = cards.activeCards.filter(c => {
        const issuer = `${c.issuer || ''} ${c.name || ''}`
        return inst === 'ntb' ? /NTB|Nations|Amex|American/i.test(issuer) : inst === 'combank' ? /Com|Commercial/i.test(issuer) : false
      })
      if (same.length === 1) return same[0]
      if (cards.activeCards.length === 1) return cards.activeCards[0]
    }
    return null
  }

  const ledgerFingerprints = computed(() => {
    const s = new Set()
    for (const t of finance.currencyTransfers || []) {
      if (t.sourceSmsFingerprint) s.add(t.sourceSmsFingerprint)
      if (t.pairedSmsFingerprint) s.add(t.pairedSmsFingerprint)
    }
    for (const i of incomes.value) if (i.sourceSmsFingerprint) s.add(i.sourceSmsFingerprint)
    return s
  })

  function cycleSummary(month = getBudgetMonth()) {
    const group = new Set(active.value.filter(a => a.wallet !== 'usd').map(a => a.id))
    const usdIds = new Set(active.value.filter(a => a.wallet === 'usd').map(a => a.id))
    const excluded = finance.excludedFromSpending
    let wentOut = 0
    let cameIn = 0
    let bills = 0
    let cardCharged = 0
    let usdPaid = 0
    let spent = 0
    const unpaid = []

    for (const e of finance.expenses) {
      if (e.monthYear !== month || e.isAggregate) continue
      const amt = e.amount || 0
      const src = expenseAccountId(e)
      if (e.status === 'paid') {
        const isSpend = !excluded.includes(e.category)
        if (isSpend) spent += amt
        if (e.category === 'cashWithdrawal' || e.refund) continue
        if (e.paidByCardId) { if (isSpend) cardCharged += amt; continue }
        if (src && usdIds.has(src)) { if (isSpend) usdPaid += amt; continue }
        if (!src || group.has(src)) wentOut += amt
      } else if (!NOT_BILLS.includes(e.category) && !e.paidByCardId && !(src && usdIds.has(src))) {
        bills += amt
        unpaid.push(e)
      }
      if (e.category === 'lend' && e.collected && e.collectedAccountId && group.has(e.collectedAccountId)) {
        const when = e.collectedAt ? getBudgetMonth(format(new Date(e.collectedAt), 'yyyy-MM-dd')) : month
        if (when === month) cameIn += amt
      }
    }
    for (const t of finance.currencyTransfers || []) {
      if (t.monthYear !== month) continue
      const { from, to, sent, received } = transferEnds(t)
      const fromIn = !!from && group.has(from)
      const toIn = !!to && group.has(to)
      if (fromIn && !toIn) wentOut += sent
      if (!fromIn && toIn) cameIn += received
    }
    for (const i of incomes.value) if (i.monthYear === month && group.has(i.accountId)) cameIn += i.amount || 0
    for (const c of corrections.value) {
      if (c.monthYear !== month || !group.has(c.accountId)) continue
      if (c.amount > 0) cameIn += c.amount
      else wentOut += -c.amount
    }
    for (const d of finance.loanDisbursements || []) {
      if (d?.monthYear === month && d.accountId && group.has(d.accountId)) cameIn += d.amount || 0
    }
    cameIn += Number(finance.monthlyIncomes?.[month]?.sideIncome) || 0

    unpaid.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
    const money = spendable.value
    const left = round2(money - bills)
    const total = Math.max(money + wentOut, wentOut + bills, 1)
    const share = v => Math.max(0, v) / total
    const covered = Math.min(bills, Math.max(0, money))
    return {
      month,
      money,
      left,
      bills: round2(bills),
      unpaid,
      wentOut: round2(wentOut),
      cameIn: round2(cameIn),
      cardCharged: round2(cardCharged),
      usdPaid: round2(usdPaid),
      spent: round2(spent),
      bar: { out: share(wentOut), due: share(covered), over: share(bills - covered) }
    }
  }

  return {
    accounts, incomes, corrections, setupComplete, lastSource,
    active, getAccount, accountsIn, cashAccount, defaultUsd, defaultLkr, tracking, fxRate,
    addAccount, updateAccount, removeAccount, isUsed,
    amountIn, expenseAccountId, transferEnds, isExchange,
    ledger, balances, balanceOf, balanceAt, historyOf,
    walletTotals, spendable, totalInLkr,
    statusOf, offAccounts, checkBalance, addCorrection, deleteCorrection,
    nextCycleFor, addIncome, updateIncome, deleteIncome, restoreIncome, salaryWaiting, rebaseOpening, rebucket,
    addTransfer, updateTransfer, deleteTransfer, restoreTransfer,
    sourceOf, applySource, defaultSource, rememberSource, sourceLabel,
    institutionFor, matchSmsAccount, matchCreditCard, ledgerFingerprints,
    cycleSummary
  }
}, { persist: { storage: capacitorStorage, pick: ['accounts', 'incomes', 'corrections', 'setupComplete', 'lastSource'] } })
