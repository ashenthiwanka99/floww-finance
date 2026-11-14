import { computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useSavingsStore } from '../stores/savingsStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { WALLETS } from '../utils/wallets'

export function useNetWorth() {
  const financeStore = useFinanceStore()
  const savingsStore = useSavingsStore()
  const accounts = useAccountsStore()
  const cardStore = useCreditCardStore()

  // Assets: savings goals + manual assets
  const savingsTotal = computed(() => savingsStore.totalSaved || 0)

  const manualAssets = computed(() =>
    (financeStore.assets || []).filter(a => !accounts.tracking || a.type === 'investment')
  )

  const manualAssetsTotal = computed(() =>
    manualAssets.value.reduce((s, a) => s + (a.balance || 0), 0)
  )

  const walletsTotal = computed(() => (accounts.tracking ? accounts.totalInLkr : 0))

  const totalAssets = computed(() => savingsTotal.value + manualAssetsTotal.value + walletsTotal.value)

  function loanBalance(l) {
    if (typeof l.outstandingBalance === 'number') return Math.max(0, l.outstandingBalance)
    return Math.max(0, (l.totalAmount || 0) - ((l.monthlyInstallment || 0) * (l.monthsPaid || 0)))
  }

  const cardsOwed = computed(() => cardStore.totalOutstanding || 0)

  const installmentsOwed = computed(() =>
    financeStore.expenses
      .filter(e => e.isInstallment && e.category !== 'loans' && e.status !== 'paid' && !e.isAggregate)
      .reduce((s, e) => s + (e.amount || 0), 0)
  )

  const totalLiabilities = computed(() =>
    financeStore.activeLoans.reduce((s, l) => s + loanBalance(l), 0) + cardsOwed.value + installmentsOwed.value
  )

  const netWorth = computed(() => totalAssets.value - totalLiabilities.value)

  const typeIcons = { bank: 'account_balance', investment: 'trending_up', cash: 'payments' }
  const typeLabels = { bank: 'Bank', investment: 'Investment', cash: 'Cash' }

  const assetsList = computed(() => {
    const list = []
    if (accounts.tracking) {
      const t = accounts.walletTotals
      for (const w of WALLETS) {
        if (!t.count[w.key]) continue
        const value = w.currency === 'USD' ? t[w.key] * (accounts.fxRate || 0) : t[w.key]
        list.push({ id: `_wallet_${w.key}`, name: w.name, typeLabel: w.currency === 'USD' ? 'In dollars, at today\'s rate' : 'Wallet', balance: value, icon: w.icon, to: '/wallets' })
      }
    }
    if (savingsTotal.value > 0) {
      list.push({ id: '_savings', name: 'Savings goals', typeLabel: 'Savings', balance: savingsTotal.value, icon: 'savings' })
    }
    for (const a of manualAssets.value) {
      list.push({ ...a, typeLabel: typeLabels[a.type] || 'Asset', icon: typeIcons[a.type] || 'payments' })
    }
    return list
  })

  const liabilitiesList = computed(() => {
    const list = financeStore.activeLoans.map(l => ({
      id: l.id,
      name: l.name,
      lender: l.lender,
      balance: loanBalance(l),
      icon: 'account_balance',
      to: '/loans'
    }))
    if (cardsOwed.value > 0) {
      list.push({ id: '_cards', name: 'Credit cards', lender: 'Owed on your cards', balance: cardsOwed.value, icon: 'credit_card', to: '/credit-cards' })
    }
    if (installmentsOwed.value > 0) {
      list.push({ id: '_installments', name: 'Installments', lender: 'Payments still to come', balance: installmentsOwed.value, icon: 'calendar_month', to: '/installments' })
    }
    return list
  })

  return {
    totalAssets,
    totalLiabilities,
    netWorth,
    assetsList,
    liabilitiesList,
    savingsTotal,
    manualAssetsTotal
  }
}
