import { APP_VERSION } from './version'
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSavingsStore } from '../stores/savingsStore'
import { useBuyListStore } from '../stores/buyListStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useSmsImportStore } from '../stores/smsImportStore'
import { checkDataIntegrity } from './dataIntegrity'

export function exportAllData() {
  const finance = useFinanceStore()
  const settings = useSettingsStore()
  const savings = useSavingsStore()
  const buyList = useBuyListStore()
  const creditCards = useCreditCardStore()
  const accounts = useAccountsStore()
  const smsImport = useSmsImportStore()

  return JSON.stringify({
    version: APP_VERSION,
    appName: 'FLOWW',
    exportedAt: new Date().toISOString(),
    finance: {
      income: finance.income,
      expenses: [...finance.expenses],
      loans: [...finance.loans],
      loanDisbursements: [...finance.loanDisbursements],
      recurringSchedules: finance.recurringSchedules || [],
      budgetLimits: { ...finance.budgetLimits },
      monthlyIncomes: { ...finance.monthlyIncomes },
      currencyTransfers: [...(finance.currencyTransfers || [])],
      usdAccount: { ...(finance.usdAccount || {}) },
      assets: [...(finance.assets || [])],
      currentMonth: finance.currentMonth,
      lastRecurringGenMonth: finance.lastRecurringGenMonth
    },
    settings: {
      userName: settings.userName,
      fxRate: { ...settings.fxRate },
      customCategories: [...settings.customCategories],
      savedExpenseNames: [...settings.savedExpenseNames],
      savedLoanTypes: [...settings.savedLoanTypes],
      savedLenders: [...settings.savedLenders],
      budgetAlertsEnabled: settings.budgetAlertsEnabled,
      alertThreshold: settings.alertThreshold,
      incomeData: settings.incomeData ? { ...settings.incomeData } : null
    },
    savings: {
      goals: [...savings.goals]
    },
    buyList: {
      items: [...buyList.items]
    },
    creditCards: {
      cards: [...(creditCards.cards || [])],
      settlementPlans: { ...(creditCards.settlementPlans || {}) },
      cardInstallmentPlans: [...(creditCards.cardInstallmentPlans || [])]
    },
    accounts: {
      accounts: [...(accounts.accounts || [])],
      incomes: [...(accounts.incomes || [])],
      corrections: [...(accounts.corrections || [])],
      setupComplete: accounts.setupComplete,
      lastSource: accounts.lastSource
    },
    smsImport: {
      importedFingerprints: [...(smsImport.importedFingerprints || [])],
      dismissedFingerprints: [...(smsImport.dismissedFingerprints || [])]
    }
  }, null, 2)
}

export function importAllData(jsonString) {
  // Size limit (max 5MB of JSON)
  if (jsonString.length > 5 * 1024 * 1024) throw new Error('Backup file too large (max 5MB)')

  // Reject prototype-pollution keys anywhere in the untrusted payload.
  const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])
  const data = JSON.parse(jsonString, (key, value) => {
    if (FORBIDDEN.has(key)) throw new Error('Invalid backup file (unsafe keys)')
    return value
  })

  if (!data || !data.appName || data.appName !== 'FLOWW') {
    throw new Error('Invalid backup file')
  }

  // Schema validation
  if (data.finance?.expenses && !Array.isArray(data.finance.expenses)) throw new Error('Invalid expenses data')
  if (data.finance?.loans && !Array.isArray(data.finance.loans)) throw new Error('Invalid loans data')
  if (data.savings?.goals && !Array.isArray(data.savings?.goals)) throw new Error('Invalid savings data')
  if (data.buyList?.items && !Array.isArray(data.buyList?.items)) throw new Error('Invalid buy list data')
  if (data.accounts?.accounts && !Array.isArray(data.accounts.accounts)) throw new Error('Invalid accounts data')
  if (data.accounts?.incomes && !Array.isArray(data.accounts.incomes)) throw new Error('Invalid money-in data')

  // Validate expense amounts are numbers
  if (data.finance?.expenses) {
    data.finance.expenses = data.finance.expenses.filter(e => {
      if (typeof e.amount !== 'number' || isNaN(e.amount)) return false
      if (!e.name || typeof e.name !== 'string') return false
      return true
    })
  }

  const finance = useFinanceStore()
  const settings = useSettingsStore()
  const savings = useSavingsStore()
  const buyList = useBuyListStore()
  const creditCards = useCreditCardStore()
  const accounts = useAccountsStore()
  const smsImport = useSmsImportStore()

  // Restore finance
  if (data.finance) {
    if (data.finance.income) finance.income = data.finance.income
    if (data.finance.expenses) finance.expenses = data.finance.expenses
    if (data.finance.loans) finance.loans = data.finance.loans
    if (data.finance.loanDisbursements) finance.loanDisbursements = data.finance.loanDisbursements
    if (data.finance.recurringSchedules) finance.recurringSchedules = data.finance.recurringSchedules
    if (data.finance.budgetLimits) finance.budgetLimits = data.finance.budgetLimits
    if (data.finance.monthlyIncomes) finance.monthlyIncomes = data.finance.monthlyIncomes
    if (Array.isArray(data.finance.currencyTransfers)) finance.currencyTransfers = data.finance.currencyTransfers
    if (data.finance.usdAccount) finance.usdAccount = data.finance.usdAccount
    if (data.finance.assets) finance.assets = data.finance.assets
    if (data.finance.currentMonth) finance.currentMonth = data.finance.currentMonth
    if (data.finance.lastRecurringGenMonth) finance.lastRecurringGenMonth = data.finance.lastRecurringGenMonth
    // Strip legacy auto-set carryovers from imported data (carryover is manual now).
    finance.purgeAutoCarryovers()
    finance.initialized = true
  }

  // Restore settings (keep user profile intact)
  if (data.settings) {
    if (data.settings.userName) settings.userName = data.settings.userName
    if (data.settings.fxRate) settings.fxRate = data.settings.fxRate
    if (data.settings.customCategories) settings.customCategories = data.settings.customCategories
    if (data.settings.savedExpenseNames) settings.savedExpenseNames = data.settings.savedExpenseNames
    if (data.settings.savedLoanTypes) settings.savedLoanTypes = data.settings.savedLoanTypes
    if (data.settings.savedLenders) settings.savedLenders = data.settings.savedLenders
    if (data.settings.budgetAlertsEnabled !== undefined) settings.budgetAlertsEnabled = data.settings.budgetAlertsEnabled
    if (data.settings.alertThreshold) settings.alertThreshold = data.settings.alertThreshold
    if (data.settings.incomeData) settings.incomeData = data.settings.incomeData
  }

  // Restore savings
  if (data.savings?.goals) savings.goals = data.savings.goals

  // Restore buy list
  if (data.buyList?.items) buyList.items = data.buyList.items

  // Restore Credit Cards
  if (data.creditCards) {
    if (Array.isArray(data.creditCards.cards)) creditCards.cards = data.creditCards.cards
    if (data.creditCards.settlementPlans && typeof data.creditCards.settlementPlans === 'object') {
      creditCards.settlementPlans = data.creditCards.settlementPlans
    }
    if (Array.isArray(data.creditCards.cardInstallmentPlans)) {
      creditCards.cardInstallmentPlans = data.creditCards.cardInstallmentPlans
    }
  }

  if (data.accounts) {
    if (Array.isArray(data.accounts.accounts)) accounts.accounts = data.accounts.accounts
    if (Array.isArray(data.accounts.incomes)) accounts.incomes = data.accounts.incomes
    if (Array.isArray(data.accounts.corrections)) accounts.corrections = data.accounts.corrections
    if (data.accounts.setupComplete !== undefined) accounts.setupComplete = !!data.accounts.setupComplete
    if (data.accounts.lastSource !== undefined) accounts.lastSource = data.accounts.lastSource
  }

  if (data.smsImport) {
    const strings = list => (Array.isArray(list) ? list.filter(x => typeof x === 'string') : [])
    for (const fp of strings(data.smsImport.importedFingerprints)) smsImport.markImported(fp)
    for (const fp of strings(data.smsImport.dismissedFingerprints)) smsImport.dismiss(fp)
  }

  // Repair the freshly imported dataset (orphan rows, missing ids, desynced
  // loan/card/savings totals). File import previously skipped this — only cloud
  // restore and cold boot ran it — so a restored file could be left inconsistent.
  try {
    checkDataIntegrity(finance, savings, buyList, settings, creditCards, accounts)
  } catch (err) {
    console.error('[FLOWW] post-import integrity check failed:', err?.message || 'Unknown error')
  }

  return {
    expenses: data.finance?.expenses?.length || 0,
    loans: data.finance?.loans?.length || 0,
    goals: data.savings?.goals?.length || 0,
    items: data.buyList?.items?.length || 0
  }
}
