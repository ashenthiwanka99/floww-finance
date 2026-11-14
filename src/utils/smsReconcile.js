const MIN = 60000
const DAY = 86400000

const tail = v => String(v || '').replace(/\D/g, '').slice(-4)
const near = (a, b, ms) => Math.abs(a - b) <= ms

export function reconcileSms(transactions, ctx = {}) {
  const isImported = ctx.isImported || (() => false)
  const isRecorded = ctx.isRecorded || isImported
  const lineOf = ctx.lineOf || (last4 => last4)
  const list = [...transactions]
    .sort((a, b) => (a.smsDate || 0) - (b.smsDate || 0))
    .map(t => ({ ...t, hidden: null, pair: null, likely: null }))

  for (let i = 0; i < list.length; i++) {
    const t = list[i]
    if (typeof t.balance !== 'number') continue
    const key = `${t.bank}|${t.type}|${t.amount}|${t.balance}|${t.card || tail(t.account)}`
    for (let j = i - 1; j >= 0; j--) {
      const p = list[j]
      if (!near(p.smsDate, t.smsDate, 30 * MIN)) break
      if (p.hidden) continue
      if (`${p.bank}|${p.type}|${p.amount}|${p.balance}|${p.card || tail(p.account)}` === key) { t.hidden = 'repeat'; break }
    }
  }

  for (const c of list.filter(t => t.type === 'confirmation')) {
    c.hidden = 'confirmation'
    const target = list.find(t => !t.hidden && t !== c && t.direction === 'out' && t.bank === c.bank &&
      Math.abs((t.amount || 0) - (c.amount || 0)) < 0.01 && near(t.smsDate, c.smsDate, 5 * MIN))
    if (target) target.toBank = c.toBank
  }

  for (const out of list.filter(t => !t.hidden && t.kind === 'own-transfer' && t.direction === 'out')) {
    const inn = list.find(t => !t.hidden && t !== out && t.kind === 'own-transfer' && t.direction === 'in' &&
      t.bank === out.bank && near(t.smsDate, out.smsDate, 10 * MIN) && !t.pairedWith)
    if (!inn) continue
    inn.hidden = 'paired'
    inn.pairedWith = out.fingerprint
    out.pair = { currency: inn.currency, amount: inn.amount, account: inn.account, balance: inn.balance, fingerprint: inn.fingerprint }
  }

  for (const inn of list.filter(t => !t.hidden && t.kind === 'bank-transfer' && t.direction === 'in')) {
    const options = list.filter(t => t !== inn && t.bank !== inn.bank && t.direction === 'out' && !t.pair && !t.usedFor &&
      (t.kind === 'bank-transfer' || t.kind === 'transfer-attempt') && (!t.hidden || t.kind === 'transfer-attempt') &&
      Math.abs((t.amount || 0) - (inn.amount || 0)) < 0.01 && near(t.smsDate, inn.smsDate, 15 * MIN))
    const out = options.find(t => t.kind === 'bank-transfer') || options[0]
    if (!out) continue
    for (const o of options) if (o !== out && o.kind === 'transfer-attempt') o.usedFor = inn.fingerprint
    out.usedFor = inn.fingerprint
    if (out.kind === 'transfer-attempt') {
      inn.fromBank = out.bank
      continue
    }
    inn.hidden = 'paired'
    inn.pairedWith = out.fingerprint
    out.pair = { bank: inn.bank, currency: inn.currency, amount: inn.amount, account: inn.account, balance: inn.balance, fingerprint: inn.fingerprint }
  }

  const where = t => `${t.bank}|${t.card || tail(t.account).slice(-3)}`
  const cancel = (inn, test, window, reason) => {
    const out = [...list].reverse().find(t => !t.hidden && t !== inn && t.direction === 'out' && where(t) === where(inn) &&
      test(t) && Math.abs((t.amount || 0) - (inn.amount || 0)) < 0.01 && t.smsDate <= inn.smsDate + 10 * MIN && near(t.smsDate, inn.smsDate, window))
    if (!out) return
    if (isRecorded(out.fingerprint)) { inn.reverses = out.fingerprint; return }
    out.hidden = reason
    inn.hidden = reason
  }
  for (const r of list.filter(t => !t.hidden && (t.type === 'reversal' || t.kind === 'reversal'))) {
    cancel(r, t => t.type === 'purchase' || t.type === 'withdrawal' || t.type === 'charge', 7 * DAY, 'reversed')
  }
  for (const r of list.filter(t => !t.hidden && t.kind === 'fee-refund')) cancel(r, t => t.kind === 'bank-fee', 2 * DAY, 'refunded')
  for (const r of list.filter(t => !t.hidden && t.kind === 'deposit-close')) cancel(r, t => t.kind === 'deposit-fund', 45 * DAY, 'parked')

  let prevByLine = {}
  for (const t of list) {
    if (t.instrument !== 'credit' || typeof t.balance !== 'number' || t.balanceKind !== 'available') continue
    const line = lineOf(t.card)
    const prev = prevByLine[line]
    if (t.currency && t.currency !== 'LKR' && t.type === 'purchase' && prev && near(prev.smsDate, t.smsDate, 31 * DAY)) {
      const diff = Math.round((prev.balance - t.balance) * 100) / 100
      if (diff > 0) t.lkrAmount = diff
    }
    if (t.hidden !== 'repeat') prevByLine[line] = t
  }

  const records = ctx.records || []
  const byAmount = new Map()
  for (const r of records) {
    const k = Math.round(r.amount)
    for (const kk of [k - 1, k, k + 1]) {
      if (!byAmount.has(kk)) byAmount.set(kk, [])
      byAmount.get(kk).push(r)
    }
  }
  const claimed = new Set()
  for (const t of list) {
    if (t.hidden || t.type === 'confirmation' || isImported(t.fingerprint)) continue
    const amount = t.lkrAmount || t.amount
    const kind = recordKindFor(t)
    const candidates = (byAmount.get(Math.round(amount)) || []).filter(r =>
      !claimed.has(r.id) &&
      Math.abs(r.amount - amount) <= 1 &&
      r.time && near(r.time, t.smsDate, 3 * DAY + 12 * 3600000) &&
      kindMatches(kind, r, t))
    if (!candidates.length) continue
    candidates.sort((a, b) => Math.abs(a.time - t.smsDate) - Math.abs(b.time - t.smsDate))
    claimed.add(candidates[0].id)
    t.likely = candidates[0]
  }

  return list
}

export function latestBalanceSms(transactions) {
  const list = transactions.filter(t => typeof t.balance === 'number').sort((a, b) => a.smsDate - b.smsDate)
  if (!list.length) return null
  let last = list[list.length - 1]
  for (let guard = 0; guard < 10; guard++) {
    const after = list.find(t => t !== last && near(t.smsDate, last.smsDate, 5 * MIN) &&
      Math.abs(last.balance + (t.direction === 'in' ? 1 : -1) * (t.amount || 0) - t.balance) < 0.01)
    if (!after) break
    last = after
  }
  return last
}

function recordKindFor(t) {
  if (t.type === 'card-payment') return 'card-payment'
  if (t.kind === 'own-transfer' || t.toBank) return 'move'
  if (t.direction === 'in') return 'in'
  return t.instrument === 'credit' ? 'card' : 'out'
}

function kindMatches(kind, r, t) {
  if (kind === 'card') return r.kind === 'out' && r.onCard && (!r.card || r.card === t.card)
  if (kind === 'card-payment') return r.kind === 'card-payment' && (!r.card || r.card === t.card)
  if (kind === 'move') return r.kind === 'move' || (r.kind === 'out' && !r.onCard)
  if (kind === 'in') return r.kind === 'in' || r.kind === 'move'
  return r.kind === 'out' && !r.onCard
}
