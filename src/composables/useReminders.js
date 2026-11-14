import { computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { addDays, isSameDay, isAfter, isBefore, parseISO, differenceInDays } from 'date-fns'

export function useReminders() {
  const store = useFinanceStore()

  const overdue = computed(() => {
    const today = new Date()
    const regular = store.expenses.filter(e =>
      e.status !== 'paid' &&
      !e.isAggregate &&
      e.dueDate &&
      parseISO(e.dueDate) < today &&
      !isSameDay(parseISO(e.dueDate), today)
    ).map(e => {
      try {
        return { ...e, overdueDays: differenceInDays(today, parseISO(e.dueDate)) }
      } catch {
        return { ...e, overdueDays: 0 }
      }
    })
    // Lend collection reminders that are overdue
    // Note: lend expenses can be status 'paid' (money was given) but still need collection
    // So we check category === 'lend' OR hasCollectionReminder, and DON'T filter by status
    const lendOverdue = store.expenses.filter(e =>
      e.hasCollectionReminder &&
      e.collectionDate &&
      !e.collected &&
      parseISO(e.collectionDate) < today &&
      !isSameDay(parseISO(e.collectionDate), today)
    ).map(e => ({
      ...e,
      overdueDays: differenceInDays(today, parseISO(e.collectionDate)),
      isLendReminder: true
    }))
    return [...regular, ...lendOverdue]
  })

  const dueTomorrow = computed(() => {
    const today = new Date()
    const tomorrow = addDays(today, 1)
    const regular = store.expenses.filter(e =>
      e.status !== 'paid' &&
      !e.isAggregate &&
      e.dueDate &&
      isSameDay(parseISO(e.dueDate), tomorrow)
    )
    // Lend collection reminders due tomorrow
    const lendTomorrow = store.expenses.filter(e =>
      e.hasCollectionReminder &&
      e.collectionDate &&
      !e.collected &&
      isSameDay(parseISO(e.collectionDate), tomorrow)
    ).map(e => ({ ...e, isLendReminder: true }))
    return [...regular, ...lendTomorrow]
  })

  const upcoming = computed(() => {
    const today = new Date()
    const tomorrow = addDays(today, 1)
    const regular = store.expenses.filter(e =>
      e.status !== 'paid' &&
      !e.isAggregate &&
      e.dueDate &&
      isAfter(parseISO(e.dueDate), tomorrow) &&
      isBefore(parseISO(e.dueDate), addDays(today, 14))
    ).map(e => {
      try {
        return { ...e, daysUntil: differenceInDays(parseISO(e.dueDate), today) }
      } catch {
        return { ...e, daysUntil: 0 }
      }
    })
    // Lend collection reminders that are upcoming
    // Don't filter by status — lend money was 'paid' (given) but collection is pending
    const lendUpcoming = store.expenses.filter(e =>
      e.hasCollectionReminder &&
      e.collectionDate &&
      !e.collected &&
      isAfter(parseISO(e.collectionDate), tomorrow) &&
      isBefore(parseISO(e.collectionDate), addDays(today, 30))
    ).map(e => ({
      ...e,
      daysUntil: differenceInDays(parseISO(e.collectionDate), today),
      isLendReminder: true
    }))
    return [...regular, ...lendUpcoming]
  })

  const overdueCount = computed(() => overdue.value.length)
  const tomorrowCount = computed(() => dueTomorrow.value.length)

  return { overdue, dueTomorrow, upcoming, overdueCount, tomorrowCount }
}
