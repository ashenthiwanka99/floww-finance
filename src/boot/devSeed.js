import { boot } from 'quasar/wrappers'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import { ingestSmsMessages } from '../composables/useSmsInbox'

// Dev only (registered in quasar.config.js when ctx.dev): open the app with
// ?demo in the URL to load a believable sample month for design work.
export default boot(() => {
  if (!location.search.includes('demo')) return

  const finance = useFinanceStore()
  const settings = useSettingsStore()
  const cards = useCreditCardStore()
  const accounts = useAccountsStore()
  const params = new URLSearchParams(location.search)
  const theme = params.get('theme')
  if (theme) settings.themeMode = theme

  const hoursAgo = h => Date.now() - h * 3600000
  const d = h => {
    const t = new Date(hoursAgo(h))
    return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${String(t.getFullYear()).slice(2)}`
  }
  ingestSmsMessages([
    { address: 'COMBANK', date: hoursAgo(2), body: `Purchase at KEELLS SUPER KOLLUPITIYA for LKR 4,250.00 on ${d(2)} 06:12 PM from card ending #3456.` },
    { address: 'NTB', date: hoursAgo(20), body: 'A TRANSACTION of LKR 1,850.00 was approved on your A/C No. 1002xxxx5678 at PICKME FOOD. Current Bal LKR 85,240.00' },
    { address: 'COMBANK', date: hoursAgo(30), body: `Purchase at PAYPAL *NETFLIX for LKR 2,499.00 on ${d(30)} 09:40 AM from card ending #3456.` },
    { address: 'NTB', date: hoursAgo(52), body: 'Transaction Approved on your Card 376657***1234 for LKR 1400.00 at CREPE RUNNER ONE GALLE FA Available Bal LKR 295002.16  Call 0114315315 for any inquiry.' },
    { address: 'COMBANK', date: hoursAgo(75), body: `Withdrawal at Peoples Bank WILACHCHIYA S LK for LKR 10,000.00 on ${d(75)} 07:03 PM from card ending #3456.` }
  ])
  if (finance.expenses.length) return

  settings.userName = 'Demo User'
  settings.onboardingComplete = true
  settings.tourCompleted = true
  settings.fxRate = { usdToLkr: 300.2, lastUpdated: Date.now() }

  const salaries = [
    ['2026-07', '2026-07-08', 1450, 296.1],
    ['2026-08', '2026-08-07', 1450, 298.4],
    ['2026-09', '2026-09-08', 1450, 299.0],
    ['2026-10', '2026-10-08', 1450, 300.2]
  ]
  for (const [month, receivedDate, usd, rate] of salaries) {
    const lkr = Math.round(usd * rate)
    finance.setMonthlyIncome(month, {
      usdAmount: usd, fxRate: rate, lkrSalary: lkr, sideIncome: 0, total: lkr,
      carryover: 0, carryoverFrom: null, salaryReceivedMonth: month,
      receivedDate, budgetSource: 'transfers', date: Date.now()
    })
    finance.addCurrencyTransfer({ date: receivedDate, usdAmount: 1000, lkrAmount: Math.round(1000 * rate), monthYear: month })
    finance.addCurrencyTransfer({ date: receivedDate.replace(/-\d\d$/, '-20'), usdAmount: 300, lkrAmount: Math.round(300 * rate), monthYear: month })
  }

  const amex = cards.addCard({ name: 'NTB Amex', issuer: 'NTB', network: 'amex', last4: '1234', limit: 500000, statementDay: 25, paymentDueDay: 10 })
  cards.addCard({ name: 'NTB Visa', issuer: 'NTB', network: 'visa', last4: '7890', limit: 300000, statementDay: 5, paymentDueDay: 20 })
  const amexId = amex?.id || cards.cards[0]?.id

  const wallets = !params.has('nowallets')
  let ntb = null
  let com = null
  let cash = null
  if (wallets) {
    const opening = new Date(2026, 9, 7, 23, 0).getTime()
    accounts.addAccount({ name: 'NTB dollar account', wallet: 'usd', institution: 'ntb', numberLast4: '9012', openingBalance: 2000, openingAt: opening, order: 0 })
    ntb = accounts.addAccount({ name: 'NTB rupee account', wallet: 'lkr', institution: 'ntb', numberLast4: '5678', cardLast4: '2345', openingBalance: 40000, openingAt: opening, order: 1 }).id
    com = accounts.addAccount({ name: 'Commercial Bank', wallet: 'lkr', institution: 'combank', cardLast4: '3456', paypal: true, openingBalance: 60000, openingAt: opening, order: 2 }).id
    cash = accounts.addAccount({ name: 'Cash on hand', wallet: 'cash', institution: 'cash', openingBalance: 12500, openingAt: opening, order: 3 }).id
    accounts.setupComplete = true
  }

  const from = id => (id ? { accountId: id, paidFromCash: id === cash || undefined } : {})
  const add = (name, amount, category, dueDate, status = 'paid', extra = {}) =>
    finance.addExpense({ name, amount, category, dueDate, status, isRecurring: false, isInstallment: false, isScheduled: false, ...extra })

  const monthly = [
    ['2026-07', '07'], ['2026-08', '08'], ['2026-09', '09'], ['2026-10', '10']
  ]
  for (const [, mm] of monthly) {
    const day = n => `2026-${mm}-${String(n).padStart(2, '0')}`
    const past = mm !== '10'
    add('Keells weekly shop', 8450 + Number(mm) * 37, 'groceries', day(10), 'paid', from(ntb))
    add('Cargills Food City', 5120, 'groceries', day(17), 'paid', from(ntb))
    add('CEB electricity', 6800 - Number(mm) * 40, 'bills', day(12), 'paid', from(com))
    add('NWSDB water', 1250, 'bills', day(14), 'paid', from(com))
    add('Netflix', 2190, 'subscriptions', day(15), 'paid', { ...from(com), via: com ? 'paypal' : undefined })
    add('PickMe rides', 1850, 'transport', day(16), 'paid', from(ntb))
    add('Fuel 92 octane', 4665, 'fuel', day(11), 'paid', { ...from(cash), fuelLiters: 15, fuelPricePerLiter: 311, fuelOdometer: 41200 + Number(mm) * 620 })
    add('Pilawoos kottu', 1600, 'dining', day(18), 'paid', from(cash))
    if (past) {
      add('Keells top-up', 3980, 'groceries', day(24))
      add('Fuel 92 octane', 4976, 'fuel', day(26), 'paid', { fuelLiters: 16, fuelPricePerLiter: 311, fuelOdometer: 41500 + Number(mm) * 620 })
      add('Dialog postpaid', 4500, 'bills', day(28))
      add('Spar groceries', 6240, 'groceries', day(30).replace('-30', mm === '09' ? '-30' : '-29'))
    }
  }
  add('Burger King, Colombo 3', 2450, 'dining', '2026-10-19', 'paid', from(ntb))
  add('Osu Pharmacy', 3200, 'healthcare', '2026-10-20', 'paid', from(com))
  add('Haircut, Salon Nayomi', 1500, 'personalCare', '2026-10-21', 'paid', from(cash))
  add('Daraz order: desk lamp', 12400, 'others', '2026-10-22', 'paid', { paidByCardId: amexId })
  add('Uber to airport', 2300, 'transport', '2026-10-23', 'paid', { paidByCardId: amexId })
  add('Spotify', 899, 'subscriptions', '2026-10-24', 'paid', { paidByCardId: amexId })
  add('Dialog postpaid', 4500, 'bills', '2026-10-28', 'pending', from(com))
  add('Keells weekly shop', 7900, 'groceries', '2026-10-25', 'paid', from(ntb))
  add('NTB Amex payment', 32100, 'creditCardPayment', '2026-11-05', 'pending', { cardId: amexId, ...from(ntb) })
  add('Home Wi-Fi, SLT Fibre', 6490, 'bills', '2026-10-27', 'pending', from(com))
  add('Insurance, AIA', 9800, 'bills', '2026-10-21', 'pending', from(ntb))

  for (let i = 0; i < 12; i++) {
    const m = 7 + i
    const due = `${2026 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-02`
    add('iPhone 16, Softlogic EMI', 28750, 'installments', due, i < 3 ? 'paid' : 'pending', {
      ...(due >= '2026-10-08' ? from(ntb) : {}),
      monthYear: `${2026 + Math.floor((m - 1) / 12)}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`,
      isInstallment: true, installmentCurrent: i + 1, installmentTotal: 12, installmentGroupId: 'demo-iphone'
    })
  }

  for (const [name, amount, category, day, due, status, src] of [
    ['YouTube Premium', 1190, 'subscriptions', 3, '2026-11-03', 'pending', com],
    ['Gym, Fitness One', 7500, 'personalCare', 20, '2026-10-20', 'paid', cash]
  ]) {
    const s = finance.addSchedule({ name, amount, category, dayOfMonth: day, startMonth: '2026-10', ...from(src) })
    add(name, amount, category, due, status, { ...from(src), isRecurring: true, scheduleId: s.id, monthYear: '2026-10' })
  }

  const loan = finance.addLoan({
    name: 'Vehicle loan', lender: 'Commercial Bank', type: 'Vehicle', totalAmount: 2400000,
    monthlyInstallment: 58500, totalMonths: 60, monthsPaid: 22, receivedDate: '2024-12-15',
    nextDueDate: '2026-11-15', status: 'active', isOneTime: false, icon: 'directions_car'
  })
  for (const [due, status, n] of [['2026-09-15', 'paid', 22], ['2026-10-15', 'paid', 23], ['2026-11-15', 'pending', 24]]) {
    add('Vehicle loan EMI', 58500, 'loans', due, status, {
      ...(due >= '2026-10-08' ? from(com) : {}),
      monthYear: due.slice(0, 7),
      isRecurring: true, isInstallment: true, installmentCurrent: n, installmentTotal: 60,
      installmentGroupId: 'demo-vehicle', loanId: loan?.id
    })
  }

  add('Kasun', 15000, 'lend', '2026-10-13', 'paid', { lentTo: 'Kasun', ...from(ntb) })

  if (wallets) {
    accounts.addIncome({ accountId: com, amount: 25000, name: 'Freelance logo job', kind: 'other', date: '2026-10-15' })
    accounts.addTransfer({ fromAccountId: ntb, toAccountId: com, amount: 50000, date: '2026-10-09', note: 'For bills' })
    accounts.addTransfer({ fromAccountId: ntb, toAccountId: cash, amount: 20000, date: '2026-10-12', note: 'ATM withdrawal' })
  } else {
    finance.addAsset({ name: 'Cash', type: 'cash', balance: 12500 })
  }

  finance.seedData()
})
