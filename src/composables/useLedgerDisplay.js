import { useAccountsStore } from '../stores/accountsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { getCategoryIcon, categoryLabel } from '../utils/categoryConfig'

export function useLedgerDisplay() {
  const accounts = useAccountsStore()
  const cards = useCreditCardStore()
  const settings = useSettingsStore()

  const nameOf = id => accounts.getAccount(id)?.name || 'another account'

  function expenseIcon(e) {
    const cat = getCategoryIcon(e.category, settings.customCategories)
    return cat.icon !== 'category' ? cat.icon : (e.icon || cat.icon)
  }

  function describe(m) {
    const item = m.item || {}
    switch (m.type) {
      case 'expense': {
        if (item.category === 'creditCardPayment') {
          const card = cards.getCard(item.cardId)
          return { icon: 'credit_card', title: item.name, meta: card ? `Paid ${card.name}` : 'Card payment', edit: 'move-expense' }
        }
        if (item.category === 'cashWithdrawal') return { icon: 'local_atm', title: item.name || 'Cash withdrawal', meta: 'Cash withdrawal', edit: 'expense' }
        const parts = [categoryLabel(item.category)]
        if (item.via === 'paypal') parts.push('PayPal')
        return { icon: expenseIcon(item), title: item.name, meta: parts.join(' · '), edit: 'expense' }
      }
      case 'cash-in':
        return { icon: 'local_atm', title: 'Cash withdrawal', meta: `From ${nameOf(m.other)}`, edit: 'expense' }
      case 'transfer-out':
        return { icon: accounts.isExchange(item) ? 'currency_exchange' : 'swap_horiz', title: `To ${nameOf(m.other)}`, meta: item.note || (accounts.isExchange(item) ? 'Dollars to LKR' : 'Move'), edit: 'transfer' }
      case 'transfer-in':
        return { icon: accounts.isExchange(item) ? 'currency_exchange' : 'swap_horiz', title: `From ${nameOf(m.other)}`, meta: item.note || (accounts.isExchange(item) ? 'Dollars to LKR' : 'Move'), edit: 'transfer' }
      case 'income':
        return { icon: item.kind === 'salary' ? 'work' : 'call_received', title: item.name, meta: item.kind === 'salary' ? 'Salary' : (item.note || 'Money in'), edit: 'income' }
      case 'salary':
        return { icon: 'work', title: 'Salary', meta: 'Salary', edit: 'salary' }
      case 'correction':
        return { icon: 'tune', title: 'Correction', meta: item.note || 'Matched to the bank balance', edit: 'correction' }
      case 'loan':
        return { icon: 'account_balance', title: 'Loan received', meta: 'Loan', edit: null }
      case 'collected':
        return { icon: 'handshake', title: `${item.lentTo || item.name} paid you back`, meta: 'Lent money back', edit: 'lend' }
      default:
        return { icon: 'receipt_long', title: item.name || 'Record', meta: '', edit: null }
    }
  }

  return { describe, nameOf }
}
