import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { formatMoney, getSalaryAnchors } from '../utils/format'
import { parseISO, differenceInDays, isSameDay, addDays, isAfter, format } from 'date-fns'

const isNative = Capacitor.isNativePlatform()

export async function initNotifications() {
  if (!isNative) return false
  try {
    const perm = await LocalNotifications.requestPermissions()
    return perm.display === 'granted'
  } catch {
    return false
  }
}

export async function scheduleAllNotifications() {
  if (!isNative) return

  const financeStore = useFinanceStore()
  const settingsStore = useSettingsStore()
  const now = new Date()
  const tomorrow = addDays(now, 1)
  const notifications = []
  let id = Date.now() % 100000

  // Cancel all existing first
  try {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications })
    }
  } catch {}

  // 1. Overdue — immediate
  financeStore.expenses
    .filter(e => e.status !== 'paid' && !e.isAggregate && e.dueDate)
    .forEach(e => {
      if (!e.dueDate) return
      try {
        const dueDate = parseISO(e.dueDate)
        const daysOverdue = differenceInDays(now, dueDate)
        if (daysOverdue > 0 && daysOverdue <= 30) {
          notifications.push({
            id: id++,
            title: `${e.name} is overdue`,
            body: `LKR ${formatMoney(e.amount)} was due ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} ago`,
            schedule: { at: new Date(now.getTime() + 5000) },
            smallIcon: 'ic_stat_notification',
            iconColor: '#1D5FBF'
          })
        }
      } catch {
        // skip invalid dates
      }
    })

  // 2. Due tomorrow — schedule for 8am tomorrow
  financeStore.expenses
    .filter(e => e.status !== 'paid' && !e.isAggregate && e.dueDate)
    .forEach(e => {
      if (!e.dueDate) return
      try {
        const dueDate = parseISO(e.dueDate)
        if (isSameDay(dueDate, tomorrow)) {
          const at = new Date(tomorrow)
          at.setHours(8, 0, 0, 0)
          if (at > now) {
            notifications.push({
              id: id++,
              title: `${e.name} due tomorrow`,
              body: `LKR ${formatMoney(e.amount)} payment due tomorrow`,
              schedule: { at },
              smallIcon: 'ic_stat_notification',
              iconColor: '#1D5FBF'
            })
          }
        }
      } catch {
        // skip invalid dates
      }
    })

  // 3. Upcoming reminders — 1 day before each due date (next 14 days)
  financeStore.expenses
    .filter(e => e.status !== 'paid' && !e.isAggregate && e.dueDate)
    .forEach(e => {
      if (!e.dueDate) return
      try {
        const dueDate = parseISO(e.dueDate)
        const daysUntil = differenceInDays(dueDate, now)
        if (daysUntil >= 2 && daysUntil <= 14) {
          const at = addDays(dueDate, -1)
          at.setHours(9, 0, 0, 0)
          if (at > now) {
            notifications.push({
              id: id++,
              title: `Payment reminder: ${e.name}`,
              body: `LKR ${formatMoney(e.amount)} due tomorrow (${format(dueDate, 'd MMM')})`,
              schedule: { at },
              smallIcon: 'ic_stat_notification',
              iconColor: '#1D5FBF'
            })
          }
        }
      } catch {
        // skip invalid dates
      }
    })

  // 4. Budget alerts
  if (settingsStore.budgetAlertsEnabled) {
    const threshold = (settingsStore.alertThreshold || 80) / 100
    const catNames = {
      groceries: 'Groceries',
      dining: 'Dining',
      bills: 'Bills',
      transport: 'Transport',
      subscriptions: 'Subscriptions',
      personalCare: 'Personal Care',
      healthcare: 'Healthcare',
      installments: 'Installments',
      creditCards: 'Credit Cards',
      loans: 'Loans',
      scheduled: 'Scheduled',
      others: 'Others',
      lend: 'Lend'
    }

    Object.entries(financeStore.budgetLimits).forEach(([cat, limit]) => {
      if (cat.startsWith('_')) return
      if (!limit) return
      const spent = financeStore.currentMonthExpenses
        .filter(e => e.category === cat && !e.isAggregate)
        .reduce((s, e) => s + e.amount, 0)
      const pct = spent / limit

      if (pct >= 1) {
        notifications.push({
          id: id++,
          title: `${catNames[cat] || cat} is over its limit`,
          body: `LKR ${formatMoney(spent)} of LKR ${formatMoney(limit)} limit`,
          schedule: { at: new Date(now.getTime() + 8000) },
          smallIcon: 'ic_stat_notification',
          iconColor: '#1D5FBF'
        })
      } else if (pct >= threshold) {
        notifications.push({
          id: id++,
          title: `${catNames[cat] || cat} at ${Math.round(pct * 100)}%`,
          body: `LKR ${formatMoney(spent)} of LKR ${formatMoney(limit)} used`,
          schedule: { at: new Date(now.getTime() + 8000) },
          smallIcon: 'ic_stat_notification',
          iconColor: '#1D5FBF'
        })
      }
    })
  }

  // 5. Salary day — same day of month as the last recorded salary, 10am
  const anchors = getSalaryAnchors()
  const lastAnchor = anchors[anchors.length - 1]
  const salaryDayOfMonth = lastAnchor ? parseISO(lastAnchor.receivedDate).getDate() : 25
  const salaryDay = new Date(now.getFullYear(), now.getMonth(), salaryDayOfMonth, 10, 0, 0)
  if (salaryDay > now) {
    notifications.push({
      id: id++,
      title: 'Salary day',
      body: 'Record your salary in Floww when it lands.',
      schedule: { at: salaryDay },
      smallIcon: 'ic_stat_notification',
      iconColor: '#1D5FBF'
    })
  }

  // 7. Lend collection reminders
  financeStore.expenses
    .filter(e =>
      e.category === 'lend' &&
      e.hasCollectionReminder &&
      e.collectionDate &&
      !e.collected
    )
    .forEach(e => {
      try {
        const collectDate = parseISO(e.collectionDate)
        if (isAfter(collectDate, now)) {
          const reminderDate = new Date(collectDate)
          reminderDate.setHours(9, 0, 0, 0)
          notifications.push({
            id: id++,
            title: `Collect from ${e.lentTo || e.name}`,
            body: `LKR ${formatMoney(e.amount)} is due back today`,
            schedule: { at: reminderDate },
            smallIcon: 'ic_stat_notification',
            iconColor: '#1D5FBF'
          })
        }
      } catch {
        // skip invalid dates
      }
    })

  // ── Credit card settlement reminders (per credit line, plan-aware) ──
  try {
    const { useCreditCardStore } = await import('../stores/creditCardStore')
    const cardStore = useCreditCardStore()
    const seenLines = new Set()
    for (const card of cardStore.activeCards || []) {
      // Dedupe linked cards — one reminder per credit line.
      const key = cardStore.lineKey(card)
      if (seenLines.has(key)) continue
      seenLines.add(key)

      const outstanding = cardStore.creditLineOutstanding(card)
      if (!outstanding || outstanding <= 0) continue

      // Plan-driven settlement date (falls back to card paymentDueDay).
      const dueDate = cardStore.nextSettlementDate(card) || cardStore.nextDueDate(card)
      if (!dueDate) continue

      const plan = cardStore.getSettlementPlan(card)
      const planned = cardStore.plannedAmount(card)
      const label = card.creditLineId ? `${card.name} line` : card.name
      const strategyTxt = plan
        ? (plan.strategy === 'custom' ? 'custom amount' : `${plan.strategy} payment`)
        : 'balance'

      // 3 days before settlement
      const threeBefore = addDays(dueDate, -3)
      if (isAfter(threeBefore, now)) {
        notifications.push({
          id: id++,
          title: `Pay ${label}`,
          body: `${plan ? 'Plan: ' + strategyTxt + ' · ' : ''}LKR ${formatMoney(planned)} of ${formatMoney(outstanding)} due ${format(dueDate, 'd MMM')}`,
          schedule: { at: threeBefore },
          smallIcon: 'ic_stat_notification',
          iconColor: '#1D5FBF'
        })
      }
      // 1 day before settlement
      const oneBefore = addDays(dueDate, -1)
      if (isAfter(oneBefore, now)) {
        notifications.push({
          id: id++,
          title: `${label} due tomorrow`,
          body: `Pay LKR ${formatMoney(planned)} before ${format(dueDate, 'd MMM')}`,
          schedule: { at: oneBefore },
          smallIcon: 'ic_stat_notification',
          iconColor: '#1D5FBF'
        })
      }
      // On settlement day
      const dueNoon = new Date(dueDate)
      dueNoon.setHours(10, 0, 0, 0)
      if (isAfter(dueNoon, now)) {
        notifications.push({
          id: id++,
          title: `${label} settlement due today`,
          body: `LKR ${formatMoney(outstanding)} owed. Interest starts tomorrow if it is not paid.`,
          schedule: { at: dueNoon },
          smallIcon: 'ic_stat_notification',
          iconColor: '#1D5FBF'
        })
      }
      // Carry reminder: balance still owed after this cycle's settlement day →
      // remind a few days into the next cycle to clear the carried amount.
      if (plan) {
        const carryAt = addDays(dueDate, -7)
        if (isAfter(carryAt, now) && new Date().getDate() > (plan.settlementDay || 27)) {
          notifications.push({
            id: id++,
            title: `Carried balance on ${label}`,
            body: `LKR ${formatMoney(outstanding)} still owed. Clear it before ${format(dueDate, 'd MMM')}`,
            schedule: { at: carryAt },
            smallIcon: 'ic_stat_notification',
            iconColor: '#1D5FBF'
          })
        }
      }
    }
  } catch {}

  // Schedule all at once
  if (notifications.length > 0) {
    try {
      await LocalNotifications.schedule({ notifications })
      // Notifications scheduled successfully
    } catch (err) {
      console.warn('FLOWW: Failed to schedule:', err)
    }
  }
}

export async function cancelAllNotifications() {
  if (!isNative) return
  try {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications })
    }
  } catch {}
}
