import { computed } from 'vue'
import { useAccountsStore } from '../stores/accountsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSmsInbox } from './useSmsInbox'
import { lastDigits, round2 } from '../utils/wallets'
import { latestBalanceSms } from '../utils/smsReconcile'

export function useBankChecks() {
  const accounts = useAccountsStore()
  const cards = useCreditCardStore()
  const { transactions, annotated, fresh, maybe } = useSmsInbox()

  function lastAccountSms(accountId) {
    const mine = transactions.value.filter(tx =>
      tx.balanceKind === 'account' && typeof tx.balance === 'number' && accounts.matchSmsAccount(tx)?.id === accountId)
    const best = latestBalanceSms(mine)
    if (!best) return null
    const at = Math.max(...mine.filter(t => Math.abs(t.smsDate - best.smsDate) <= 300000).map(t => t.smsDate))
    return { at, balance: best.balance, label: best.merchant }
  }

  function rebaseOffer(accountId) {
    const a = accounts.getAccount(accountId)
    if (!a?.openingAt) return null
    const sms = lastAccountSms(accountId)
    if (!sms || sms.at > a.openingAt) return null
    if (Math.abs(sms.balance - (Number(a.openingBalance) || 0)) < 1) return null
    return sms
  }

  const cardLines = computed(() => {
    const lines = new Map()
    for (const c of cards.activeCards) {
      const key = cards.lineKey(c)
      if (!lines.has(key)) lines.set(key, { key, cards: [], limit: Number(c.limit) || 0 })
      lines.get(key).cards.push(c)
    }
    const tails = key => new Set(lines.get(key).cards.map(c => lastDigits(c.last4)).filter(Boolean))
    const out = []
    for (const line of lines.values()) {
      const own = tails(line.key)
      const sms = annotated.value
        .filter(t => t.instrument === 'credit' && t.balanceKind === 'available' && typeof t.balance === 'number' && t.hidden !== 'repeat' && own.has(lastDigits(t.card)))
        .sort((a, b) => b.smsDate - a.smsDate)[0]
      const floww = round2(line.cards.reduce((s, c) => s + (c.currentOutstanding || 0), 0))
      if (!sms || !line.limit) { out.push({ ...line, floww, bank: null }); continue }
      const bank = round2(line.limit - sms.balance)
      const waiting = [...fresh.value, ...maybe.value].filter(t => t.instrument === 'credit' && own.has(lastDigits(t.card))).length
      out.push({ ...line, floww, bank, at: sms.smsDate, diff: round2(bank - floww), waiting, card: line.cards.find(c => lastDigits(c.last4) === lastDigits(sms.card)) || line.cards[0] })
    }
    return out
  })

  const cardsOff = computed(() => cardLines.value.filter(l => l.bank !== null && Math.abs(l.diff) >= 1))

  function acceptCardFigure(line) {
    const card = line.card
    if (!card || line.bank === null) return
    card.outstandingAdjustment = round2((card.outstandingAdjustment || 0) + line.diff)
    card.currentOutstanding = round2(Math.max(0, (card.currentOutstanding || 0) + line.diff))
    card.updatedAt = Date.now()
  }

  return { lastAccountSms, rebaseOffer, cardLines, cardsOff, acceptCardFigure }
}
