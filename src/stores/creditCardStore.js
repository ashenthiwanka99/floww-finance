import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { format, parseISO, addMonths, isAfter } from 'date-fns'
import { capacitorStorage } from '../utils/capacitorStorage'
import { getBudgetMonth } from '../utils/format'

export const useCreditCardStore = defineStore('creditCards', () => {
  const cards = ref([])
  // Per credit-line settlement plans, keyed by lineKey(card).
  // { [lineKey]: { strategy:'full'|'half'|'min'|'custom', customAmount, settlementDay, active } }
  const settlementPlans = ref({})
  // Card installment purchases (full amount charged now, repaid over N months).
  // { id, lineKey, cardId, name, totalAmount, months, monthlyAmount, startMonth, dayOfMonth, category, createdAt }
  const cardInstallmentPlans = ref([])

  // ── Computeds ──
  const activeCards = computed(() => cards.value.filter(c => c.active !== false))

  // A card's settlement/report identity: its shared credit line, else itself.
  function lineKey(card) {
    return card?.creditLineId || card?.id || null
  }

  function getCard(id) {
    return cards.value.find(c => c.id === id) || null
  }

  // Total liability across all active cards (sum of outstanding balances)
  const totalOutstanding = computed(() =>
    activeCards.value.reduce((s, c) => s + (c.currentOutstanding || 0), 0)
  )

  // Cards sharing the same creditLineId share one limit. Group them so the
  // shared limit isn't double-counted when summing available credit.
  function linkedCards(card) {
    if (!card?.creditLineId) return [card]
    return activeCards.value.filter(c => c.creditLineId === card.creditLineId)
  }

  function creditLineOutstanding(card) {
    return linkedCards(card).reduce((s, c) => s + (c.currentOutstanding || 0), 0)
  }

  function creditLineLimit(card) {
    return card?.limit || 0
  }

  // Total available credit across all distinct credit lines
  const totalAvailable = computed(() => {
    const seen = new Set()
    let total = 0
    for (const c of activeCards.value) {
      const key = c.creditLineId || `_self:${c.id}`
      if (seen.has(key)) continue
      seen.add(key)
      const outstanding = c.creditLineId ? creditLineOutstanding(c) : (c.currentOutstanding || 0)
      total += Math.max(0, (c.limit || 0) - outstanding)
    }
    return total
  })

  function utilizationPercent(card) {
    if (!card || !card.limit) return 0
    const outstanding = card.creditLineId ? creditLineOutstanding(card) : (card.currentOutstanding || 0)
    return Math.max(0, Math.round((outstanding / card.limit) * 100))
  }

  // Returns the next payment due date for a card (the upcoming due day after today).
  // Clamps the due day to each month's length so day 29-31 doesn't roll into the
  // next month (e.g. due-day 31 in February → Feb 28/29, not Mar 3).
  function nextDueDate(card) {
    if (!card?.paymentDueDay) return null
    const today = new Date()
    const clamped = (y, m) => new Date(y, m, Math.min(card.paymentDueDay, new Date(y, m + 1, 0).getDate()))
    const dueThisMonth = clamped(today.getFullYear(), today.getMonth())
    if (isAfter(dueThisMonth, today)) return dueThisMonth
    return clamped(today.getFullYear(), today.getMonth() + 1)
  }

  // ── Card CRUD ──
  function addCard(data) {
    if (!data?.name?.trim()) return { success: false, errors: ['Card name is required'] }
    if (!data?.limit || data.limit <= 0) return { success: false, errors: ['Credit limit must be greater than 0'] }

    // If sharing a credit line with an existing card, adopt that card's
    // creditLineId (creating one if needed) and force the same limit.
    let creditLineId = null
    let limit = Number(data.limit)
    if (data.shareWithCardId) {
      const target = getCard(data.shareWithCardId)
      if (target) {
        if (!target.creditLineId) {
          target.creditLineId = uuidv4()
          target.updatedAt = Date.now()
        }
        creditLineId = target.creditLineId
        limit = target.limit
      }
    }

    const card = {
      id: uuidv4(),
      name: data.name.trim(),
      issuer: data.issuer?.trim() || '',
      network: data.network || 'visa',
      last4: data.last4?.trim() || '',
      currency: data.currency || 'LKR',
      limit,
      creditLineId,
      statementDay: Math.max(1, Math.min(31, Number(data.statementDay) || 25)),
      paymentDueDay: Math.max(1, Math.min(31, Number(data.paymentDueDay) || 15)),
      minPaymentPercent: Number(data.minPaymentPercent) || 5,
      interestRate: Number(data.interestRate) || 0,
      color: data.color || '#C0C1FF',
      icon: 'credit_card',
      annualFee: Number(data.annualFee) || 0,
      notes: data.notes?.trim() || '',
      active: true,
      currentOutstanding: 0,
      totalCharged: 0,
      totalPaid: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    cards.value.push(card)
    return { success: true, id: card.id }
  }

  function updateCard(id, updates) {
    const idx = cards.value.findIndex(c => c.id === id)
    if (idx === -1) return { success: false }
    if (updates.limit !== undefined && (updates.limit <= 0 || isNaN(updates.limit))) {
      return { success: false, errors: ['Limit must be greater than 0'] }
    }
    const before = cards.value[idx]
    cards.value[idx] = { ...before, ...updates, id, updatedAt: Date.now() }

    // If limit changed on a linked card, propagate to all members of the
    // shared credit line so they stay consistent.
    const after = cards.value[idx]
    if (after.creditLineId && updates.limit !== undefined && updates.limit !== before.limit) {
      cards.value.forEach((c, i) => {
        if (i !== idx && c.creditLineId === after.creditLineId) {
          cards.value[i] = { ...c, limit: after.limit, updatedAt: Date.now() }
        }
      })
    }
    return { success: true }
  }

  // Link this card into the same credit line as targetCard. If neither has a
  // creditLineId, generate a new one. The "kept" limit comes from targetCard.
  function linkCards(cardId, targetCardId) {
    const card = getCard(cardId)
    const target = getCard(targetCardId)
    if (!card || !target || card.id === target.id) return { success: false }
    if (!target.creditLineId) target.creditLineId = uuidv4()
    card.creditLineId = target.creditLineId
    card.limit = target.limit
    card.updatedAt = Date.now()
    target.updatedAt = Date.now()
    return { success: true }
  }

  // Unlink card from its credit line. If only one other card remains in the
  // line, also clear that card's creditLineId (a "line of one" is meaningless).
  function unlinkCard(cardId) {
    const card = getCard(cardId)
    if (!card?.creditLineId) return { success: false }
    const lineId = card.creditLineId
    card.creditLineId = null
    card.updatedAt = Date.now()
    const remaining = cards.value.filter(c => c.creditLineId === lineId)
    if (remaining.length === 1) {
      remaining[0].creditLineId = null
      remaining[0].updatedAt = Date.now()
    }
    return { success: true }
  }

  function deleteCard(id) {
    const card = getCard(id)
    cards.value = cards.value.filter(c => c.id !== id)
    // If the deleted card was part of a credit line that now has only one
    // member left, drop the linkage on that lone survivor too.
    if (card?.creditLineId) {
      const remaining = cards.value.filter(c => c.creditLineId === card.creditLineId)
      if (remaining.length === 1) {
        remaining[0].creditLineId = null
        remaining[0].updatedAt = Date.now()
      }
    }
    return { success: true }
  }

  // ── Outstanding balance sync (called by financeStore on charge/payment) ──
  function applyCharge(cardId, amount) {
    const card = getCard(cardId)
    if (!card) return
    card.currentOutstanding = Math.max(0, (card.currentOutstanding || 0) + amount)
    card.totalCharged = (card.totalCharged || 0) + amount
    card.updatedAt = Date.now()
  }

  function reverseCharge(cardId, amount) {
    const card = getCard(cardId)
    if (!card) return
    card.currentOutstanding = Math.max(0, (card.currentOutstanding || 0) - amount)
    card.totalCharged = Math.max(0, (card.totalCharged || 0) - amount)
    card.updatedAt = Date.now()
  }

  function applyPayment(cardId, amount) {
    const card = getCard(cardId)
    if (!card) return
    card.currentOutstanding = Math.max(0, (card.currentOutstanding || 0) - amount)
    card.totalPaid = (card.totalPaid || 0) + amount
    card.updatedAt = Date.now()
  }

  function reversePayment(cardId, amount) {
    const card = getCard(cardId)
    if (!card) return
    // Don't clamp to limit: outstanding is per-card while limit is shared
    // across a linked credit line, and a balance can legitimately sit
    // over-limit. Mirror applyCharge's floor-at-zero instead.
    card.currentOutstanding = Math.max(0, (card.currentOutstanding || 0) + amount)
    card.totalPaid = Math.max(0, (card.totalPaid || 0) - amount)
    card.updatedAt = Date.now()
  }

  // ── Settlement plans (per credit line) ──
  function getSettlementPlan(card) {
    const key = lineKey(card)
    if (!key) return null
    return settlementPlans.value[key] || null
  }

  function setSettlementPlan(card, plan) {
    const key = lineKey(card)
    if (!key) return { success: false }
    if (!plan || plan.active === false) {
      delete settlementPlans.value[key]
      settlementPlans.value = { ...settlementPlans.value }
      return { success: true }
    }
    settlementPlans.value = {
      ...settlementPlans.value,
      [key]: {
        strategy: plan.strategy || 'full',
        customAmount: Number(plan.customAmount) || 0,
        settlementDay: Math.max(1, Math.min(31, Number(plan.settlementDay) || card?.paymentDueDay || 27)),
        active: true
      }
    }
    return { success: true }
  }

  // Planned settlement amount for a card's line, based on its saved plan.
  function plannedAmount(card) {
    const outstanding = creditLineOutstanding(card)
    const plan = getSettlementPlan(card)
    if (!plan) return outstanding // no plan → assume full
    switch (plan.strategy) {
      case 'half': return Math.round(outstanding / 2)
      case 'min': return Math.round(outstanding * ((card?.minPaymentPercent || 5) / 100))
      case 'custom': return Math.min(outstanding, Math.round(plan.customAmount || 0))
      case 'full':
      default: return outstanding
    }
  }

  // Next settlement date — like nextDueDate but driven by the plan's settlementDay
  // (falls back to the card's paymentDueDay).
  function nextSettlementDate(card) {
    const plan = getSettlementPlan(card)
    const day = plan?.settlementDay || card?.paymentDueDay
    if (!day) return null
    const today = new Date()
    const clamped = (y, m) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()))
    const thisMonth = clamped(today.getFullYear(), today.getMonth())
    if (isAfter(thisMonth, today)) return thisMonth
    return clamped(today.getFullYear(), today.getMonth() + 1)
  }

  // ── Card installment purchase (full amount charged now, repaid over N months) ──
  // Charges the full amount to the card immediately (via a paidByCardId expense),
  // then schedules N pending creditCardPayment EMIs that pay it down month by month.
  async function createCardInstallmentPlan(payload) {
    const card = getCard(payload?.cardId)
    if (!card) return { success: false, errors: ['Card not found'] }
    const total = Number(payload.totalAmount)
    const months = Math.max(1, Math.floor(Number(payload.months) || 0))
    if (!total || total <= 0) return { success: false, errors: ['Total must be greater than 0'] }
    if (!payload.name?.trim()) return { success: false, errors: ['Name is required'] }

    const planId = uuidv4()
    const startDate = payload.startDate || format(new Date(), 'yyyy-MM-dd')
    const startD = parseISO(startDate)
    const dayOfMonth = startD.getDate()
    const category = payload.category || 'Shopping'
    const baseEmi = Math.floor(total / months)
    const lastEmi = total - baseEmi * (months - 1) // absorb rounding remainder

    let fin
    try {
      const mod = await import('./financeStore')
      fin = mod.useFinanceStore()
    } catch {
      return { success: false, errors: ['Internal error'] }
    }

    // 1) Full purchase charged to the card now (hits applyCharge via paidByCardId).
    fin.addExpense({
      name: payload.name.trim(),
      amount: total,
      category,
      icon: card.icon || 'credit_card',
      iconColor: card.color || '#C0C1FF',
      dueDate: startDate,
      status: 'paid',
      isRecurring: false,
      isInstallment: false,
      paidByCardId: card.id,
      cardInstallmentPlanId: planId,
      notes: `Card installment purchase · ${months} mo`
    })

    // 2) N pending EMIs that repay the card month by month.
    for (let i = 1; i <= months; i++) {
      const dueD = addMonths(startD, i)
      const dueDate = format(dueD, 'yyyy-MM-dd')
      fin.addExpense({
        name: `${payload.name.trim()} EMI`,
        amount: i === months ? lastEmi : baseEmi,
        category: 'creditCardPayment',
        icon: 'credit_card',
        iconColor: card.color || '#C0C1FF',
        dueDate,
        // Anchor each EMI to its own calendar month, NOT getBudgetMonth:
        // the cycle rule would push a late-month due date a whole budget-month
        // on and the schedule would drift off-by-one.
        monthYear: format(dueD, 'yyyy-MM'),
        status: 'pending',
        isRecurring: false,
        isInstallment: true,
        installmentGroupId: planId,
        installmentCurrent: i,
        installmentTotal: months,
        cardId: card.id,
        cardInstallmentPlanId: planId,
        notes: `EMI ${i}/${months} · ${payload.name.trim()}`
      })
    }

    cardInstallmentPlans.value.push({
      id: planId,
      lineKey: lineKey(card),
      cardId: card.id,
      name: payload.name.trim(),
      totalAmount: total,
      months,
      monthlyAmount: baseEmi,
      startMonth: getBudgetMonth(startDate),
      dayOfMonth,
      category,
      createdAt: Date.now()
    })
    return { success: true, id: planId }
  }

  function cardInstallmentPlansFor(card) {
    const key = lineKey(card)
    return cardInstallmentPlans.value.filter(p => p.lineKey === key || p.cardId === card?.id)
  }

  return {
    settlementPlans,
    cardInstallmentPlans,
    lineKey,
    getSettlementPlan,
    setSettlementPlan,
    plannedAmount,
    nextSettlementDate,
    createCardInstallmentPlan,
    cardInstallmentPlansFor,
    cards,
    activeCards,
    totalOutstanding,
    totalAvailable,
    getCard,
    utilizationPercent,
    nextDueDate,
    linkedCards,
    creditLineOutstanding,
    creditLineLimit,
    addCard,
    updateCard,
    deleteCard,
    linkCards,
    unlinkCard,
    applyCharge,
    reverseCharge,
    applyPayment,
    reversePayment
  }
}, { persist: { storage: capacitorStorage } })
