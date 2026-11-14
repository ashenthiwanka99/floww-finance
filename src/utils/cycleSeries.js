import { parseISO, differenceInCalendarDays, addMonths, subDays, addDays, format } from 'date-fns'
import { getCycleWindow } from './format'

export function cycleBounds(month) {
  const w = getCycleWindow(month)
  if (!w?.start) return null
  const start = parseISO(w.start)
  const end = w.end ? parseISO(w.end) : subDays(addMonths(start, 1), 1)
  const days = differenceInCalendarDays(end, start) + 1
  return { start, end, days, estimated: !w.end, dates: Array.from({ length: days }, (_, i) => addDays(start, i)) }
}

export function previousMonth(month) {
  return format(addMonths(parseISO(`${month}-01`), -1), 'yyyy-MM')
}

export function dailySpending(finance, month, bounds) {
  const values = new Array(bounds.days).fill(0)
  for (const e of finance.expenses) {
    if (e.monthYear !== month || e.status !== 'paid' || finance.excludedFromSpending.includes(e.category)) continue
    const when = e.dueDate ? parseISO(e.dueDate) : (e.createdAt ? new Date(e.createdAt) : bounds.start)
    const i = Math.min(bounds.days - 1, Math.max(0, differenceInCalendarDays(when, bounds.start)))
    values[i] += e.amount || 0
  }
  return values
}

export function cumulative(values) {
  let run = 0
  return values.map(v => (run += v))
}

export function todayIndex(bounds) {
  return differenceInCalendarDays(new Date(), bounds.start)
}
