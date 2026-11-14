import { format, addMonths, subDays, parseISO } from 'date-fns'

export const SALARY_CUTOFF_DAY = 25

let salaryAnchors = []

function toDateKey(value) {
  if (!value) return format(new Date(), 'yyyy-MM-dd')
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return null
  return format(d, 'yyyy-MM-dd')
}

function legacyBudgetMonth(dateKey) {
  const d = parseISO(dateKey)
  if (isNaN(d.getTime())) return format(new Date(), 'yyyy-MM')
  if (d.getDate() >= SALARY_CUTOFF_DAY) return format(addMonths(d, 1), 'yyyy-MM')
  return format(d, 'yyyy-MM')
}

export function setSalaryAnchors(anchors) {
  salaryAnchors = (Array.isArray(anchors) ? anchors : [])
    .filter(a =>
      a &&
      typeof a.monthYear === 'string' && /^\d{4}-\d{2}$/.test(a.monthYear) &&
      typeof a.receivedDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.receivedDate)
    )
    .map(a => ({ monthYear: a.monthYear, receivedDate: a.receivedDate.slice(0, 10) }))
    .sort((a, b) => a.receivedDate.localeCompare(b.receivedDate))
}

export function getSalaryAnchors() {
  return salaryAnchors.map(a => ({ ...a }))
}

export function getBudgetMonth(dateStr) {
  const dateKey = toDateKey(dateStr)
  if (!dateKey) return format(new Date(), 'yyyy-MM')

  for (let i = salaryAnchors.length - 1; i >= 0; i--) {
    if (salaryAnchors[i].receivedDate <= dateKey) return salaryAnchors[i].monthYear
  }

  return legacyBudgetMonth(dateKey)
}

export function getCycleWindow(monthYear) {
  const index = salaryAnchors.findIndex(a => a.monthYear === monthYear)
  if (index === -1) return null

  const next = salaryAnchors[index + 1]
  return {
    start: salaryAnchors[index].receivedDate,
    end: next ? format(subDays(parseISO(next.receivedDate), 1), 'yyyy-MM-dd') : null
  }
}

export function suggestBudgetMonth(receivedDate) {
  const newest = salaryAnchors[salaryAnchors.length - 1]
  if (newest) {
    const [y, m] = newest.monthYear.split('-').map(Number)
    return format(addMonths(new Date(y, m - 1), 1), 'yyyy-MM')
  }
  const dateKey = toDateKey(receivedDate)
  if (!dateKey) return format(addMonths(new Date(), 1), 'yyyy-MM')
  return format(addMonths(parseISO(dateKey), 1), 'yyyy-MM')
}

/**
 * Format a number with commas: 185000 → "185,000"
 */
export function formatMoney(num) {
  if (num === null || num === undefined) return '0'
  const n = Number(num)
  if (!Number.isFinite(n)) return '0'
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Format compact: 4200000 → "4.2M", 185000 → "185k", -1200000 → "-1.2M"
 */
export function formatCompact(num) {
  const n = Number(num)
  if (!Number.isFinite(n) || n === 0) return '0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1000000) return sign + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (abs >= 1000) return sign + (abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1) + 'k'
  return formatMoney(n)
}
