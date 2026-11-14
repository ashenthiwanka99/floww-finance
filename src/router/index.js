import { route } from 'quasar/wrappers'
import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../pages/LoginPage.vue')
  },
  {
    path: '/signup',
    name: 'signup',
    component: () => import('../pages/SignUpPage.vue')
  },
  {
    path: '/welcome',
    name: 'welcome',
    component: () => import('../pages/WelcomePage.vue')
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('../pages/OnboardingPage.vue')
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'dashboard', component: () => import('../pages/DashboardPage.vue') },
      { path: 'expenses', name: 'expenses', component: () => import('../pages/ExpensesPage.vue') },
      { path: 'bills', name: 'bills', component: () => import('../pages/BillsPage.vue') },
      { path: 'more', name: 'more', component: () => import('../pages/MorePage.vue') },
      { path: 'loans', name: 'loans', component: () => import('../pages/LoansPage.vue') },
      { path: 'profile', name: 'profile', component: () => import('../pages/ProfilePage.vue') },
      { path: 'wallets', name: 'wallets', component: () => import('../pages/WalletsPage.vue') },
      { path: 'wallets/setup', name: 'walletSetup', component: () => import('../pages/WalletSetupPage.vue') },
      { path: 'accounts/:accountId', name: 'account', component: () => import('../pages/AccountPage.vue') },
      { path: 'salary', name: 'salary', component: () => import('../pages/SalaryPage.vue') },
      { path: 'monthly-income', redirect: '/salary' },
      { path: 'monthly-report', name: 'monthlyReport', component: () => import('../pages/MonthlyReportPage.vue') },
      { path: 'payment-history', name: 'paymentHistory', component: () => import('../pages/PaymentHistoryPage.vue') },
      { path: 'custom-categories', name: 'customCategories', component: () => import('../pages/CustomCategoriesPage.vue') },
      { path: 'budget-limits', name: 'budgetLimits', component: () => import('../pages/BudgetLimitsPage.vue') },
      { path: 'cloud-sync', name: 'cloudSync', component: () => import('../pages/CloudSyncPage.vue') },
      { path: 'backup', name: 'backup', component: () => import('../pages/BackupRestorePage.vue') },
      { path: 'fuel-tracker', name: 'fuelTracker', component: () => import('../pages/FuelTrackerPage.vue') },
      { path: 'lend-tracker', name: 'lendTracker', component: () => import('../pages/LendTrackerPage.vue') },
      { path: 'installments', name: 'installments', component: () => import('../pages/InstallmentDashboardPage.vue') },
      { path: 'net-worth', name: 'netWorth', component: () => import('../pages/NetWorthPage.vue') },
      { path: 'reminders', redirect: '/bills' },
      { path: 'settings/recurring', redirect: '/bills' },
      { path: 'settings/preferences', redirect: '/profile' },
      { path: 'settings/budget', redirect: '/budget-limits' },
      { path: 'search', redirect: '/expenses' },
      { path: 'trash', name: 'trash', component: () => import('../pages/TrashPage.vue') },
      { path: 'sms-import', name: 'smsImport', component: () => import('../pages/SmsImportPage.vue') },
      { path: 'credit-cards', name: 'creditCards', component: () => import('../pages/CreditCardsPage.vue') },
      { path: 'credit-cards/:cardId', name: 'creditCardDetail', component: () => import('../pages/CreditCardDetailPage.vue') }
    ]
  },
  {
    path: '/:catchAll(.*)*',
    redirect: '/'
  }
]

const PUBLIC_ROUTES = new Set(['login', 'signup', 'welcome', 'onboarding'])

export default route(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : (process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory)

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE)
  })

  // Block deep-linking into app pages before onboarding is complete so a
  // restored WebView state / app link can't skip the welcome+lock flow.
  Router.beforeEach(async (to) => {
    if (PUBLIC_ROUTES.has(to.name)) return true
    try {
      const { useSettingsStore } = await import('../stores/settingsStore')
      const settings = useSettingsStore()
      if (settings.onboardingComplete === false) {
        return { name: 'welcome' }
      }
    } catch { /* store not ready — let App.vue handle gating */ }
    return true
  })

  return Router
})
