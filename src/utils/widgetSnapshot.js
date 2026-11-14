import { format, parseISO, addMonths, subDays } from 'date-fns'
import { formatMoney, getBudgetMonth, getCycleWindow } from './format'
import { categoryLabel } from './categoryConfig'

const NOT_UNPAID = ['savings', 'cashWithdrawal', 'lend']

const sum = list => list.reduce((s, x) => s + (x?.amount || 0), 0)
const perMille = (v, total) => Math.round((Math.max(0, v) / total) * 1000)
const share = v => Math.round(Math.max(0, Math.min(1, v || 0)) * 1000)

function legacy(finance, month, rows, paid, excluded) {
  const moved = finance.getIncomeForMonth(month) + sum((finance.loanDisbursements || []).filter(d => d?.monthYear === month))
  const spent = sum(paid.filter(e => !excluded.includes(e.category)))
  const left = moved - spent
    - sum(paid.filter(e => e.category === 'savings'))
    - sum(paid.filter(e => e.category === 'lend'))
    - sum(paid.filter(e => e.category === 'loans' || e.category === 'creditCardPayment'))
    + sum(paid.filter(e => e.paidByCardId))
  const out = moved - left
  const unpaid = rows
    .filter(e => e.status !== 'paid' && !NOT_UNPAID.includes(e.category))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  const due = sum(unpaid)
  const total = Math.max(moved, out + due, 1)
  if (finance.currentMonth === month) {
    console.assert(Math.round(left) === Math.round(finance.monthlyClearBalance), '[FLOWW] widget left differs from Home', left, finance.monthlyClearBalance)
  }
  return {
    left,
    moved,
    out,
    due,
    unpaid,
    sub: `of ${formatMoney(moved)} moved in`,
    labels: { moved: 'Moved in', out: 'Paid out', due: 'Unpaid' },
    bar: {
      out: perMille(Math.min(out, moved), total),
      due: perMille(Math.min(due, Math.max(0, moved - out)), total),
      over: perMille(out + due - moved, total)
    }
  }
}

export function buildWidgetSnapshot(finance, accounts = null) {
  const month = getBudgetMonth()
  const rows = finance.expenses.filter(e => e.monthYear === month)
  const paid = rows.filter(e => e.status === 'paid')
  const excluded = finance.excludedFromSpending
  const spending = paid.filter(e => !excluded.includes(e.category))

  let v
  if (accounts?.tracking) {
    const s = accounts.cycleSummary(month)
    v = {
      left: s.left,
      moved: s.money,
      out: s.wentOut,
      due: s.bills,
      unpaid: s.unpaid,
      sub: s.bills > 0 ? `after ${formatMoney(s.bills)} of bills` : 'nothing left to pay',
      labels: { moved: 'LKR and cash', out: 'Paid out', due: 'Bills to pay' },
      bar: { out: share(s.bar.out), due: share(s.bar.due), over: share(s.bar.over) }
    }
  } else {
    v = legacy(finance, month, rows, paid, excluded)
  }

  const next = v.unpaid.find(e => e.dueDate) || v.unpaid[0]
  const byCategory = {}
  for (const e of spending) byCategory[e.category] = (byCategory[e.category] || 0) + e.amount
  const [topKey, topAmount] = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0] || []

  const w = getCycleWindow(month)
  const cycleEnd = w?.start
    ? (w.end || format(subDays(addMonths(parseISO(w.start), 1), 1), 'yyyy-MM-dd'))
    : null

  return {
    v: 2,
    month,
    cycleEnd,
    left: formatMoney(v.left),
    leftNegative: Math.round(v.left) < 0,
    moved: formatMoney(v.moved),
    out: formatMoney(v.out),
    due: formatMoney(v.due),
    dueCount: v.unpaid.length,
    spent: formatMoney(sum(spending)),
    sub: v.sub,
    labels: v.labels,
    bar: v.bar,
    next: next ? { name: next.name || 'Payment', amount: formatMoney(next.amount), dueDate: next.dueDate || null } : null,
    top: topKey ? { label: categoryLabel(topKey), amount: formatMoney(topAmount) } : null
  }
}
