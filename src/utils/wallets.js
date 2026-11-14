import { parseISO, isValid } from 'date-fns'

export const WALLETS = [
  { key: 'lkr', name: 'LKR wallet', short: 'LKR', currency: 'LKR', icon: 'account_balance' },
  { key: 'usd', name: 'Dollar wallet', short: 'Dollars', currency: 'USD', icon: 'attach_money' },
  { key: 'cash', name: 'Cash on hand', short: 'Cash', currency: 'LKR', icon: 'payments' }
]

export const INSTITUTIONS = {
  ntb: { name: 'Nations Trust Bank', short: 'NTB' },
  combank: { name: 'Commercial Bank', short: 'ComBank' },
  cash: { name: 'Cash', short: 'Cash' },
  other: { name: 'Other bank', short: 'Bank' }
}

export function walletInfo(key) {
  return WALLETS.find(w => w.key === key) || WALLETS[0]
}

export function institutionShort(key) {
  return (INSTITUTIONS[key] || INSTITUTIONS.other).short
}

export const round2 = v => Math.round((Number(v) || 0) * 100) / 100

const DAY = 86400000

export function effectiveAt(date, at, createdAt) {
  if (at) return at
  const d = date ? parseISO(date) : null
  if (!d || !isValid(d)) return createdAt || 0
  const start = d.getTime()
  if (createdAt && createdAt >= start && createdAt < start + DAY) return createdAt
  return start + DAY / 2
}

export function formatAmount(n, currency = 'LKR') {
  const v = Math.abs(Number(n) || 0)
  if (currency === 'USD') {
    const whole = Number.isInteger(round2(v))
    return v.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
  }
  return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function money(n, currency = 'LKR') {
  const v = Number(n) || 0
  const sign = Math.round(v * 100) < 0 ? '-' : ''
  return currency === 'USD' ? `${sign}$${formatAmount(v, 'USD')}` : `${sign}LKR ${formatAmount(v)}`
}

export function signedMoney(n, currency = 'LKR') {
  const v = Number(n) || 0
  if (Math.round(v * 100) === 0) return money(0, currency)
  return `${v > 0 ? '+' : '-'}${currency === 'USD' ? '$' : ''}${formatAmount(v, currency)}`
}

export function lastDigits(value, count = 4) {
  return String(value || '').replace(/\D/g, '').slice(-count)
}
