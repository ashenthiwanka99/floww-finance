<template>
  <q-page>
    <header class="page-head more-head">
      <img src="/floww-mark.svg" alt="" class="more-mark" width="28" height="28" />
      <h1>Floww</h1>
      <router-link to="/profile" class="more-user" :aria-label="`Settings for ${settings.userName || 'you'}`">
        <img v-if="settings.profileImage" :src="settings.profileImage" alt="" />
        <span v-else>{{ initial }}</span>
      </router-link>
    </header>

    <section v-for="group in groups" :key="group.title" class="section">
      <div class="section-head"><h2>{{ group.title }}</h2></div>
      <nav class="list">
        <router-link v-for="item in group.items" :key="item.to" :to="item.to" class="row">
          <span class="row__icon material-symbols-outlined">{{ item.icon }}</span>
          <span class="row__main">
            <span class="row__title">{{ item.label }}</span>
            <span v-if="item.meta" class="row__meta num">{{ item.meta }}</span>
          </span>
          <span class="row__chev material-symbols-outlined">chevron_right</span>
        </router-link>
      </nav>
    </section>

    <p class="more-version num">Floww {{ APP_VERSION }}</p>
  </q-page>
</template>

<script setup>
import { computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAccountsStore } from '../stores/accountsStore'
import { getSalaryAnchors } from '../utils/format'
import { format, parseISO } from 'date-fns'
import { formatMoney } from '../utils/format'
import { APP_VERSION } from '../utils/version'
import { useSmsInbox } from '../composables/useSmsInbox'

const finance = useFinanceStore()
const cards = useCreditCardStore()
const settings = useSettingsStore()
const accounts = useAccountsStore()
const sms = useSmsInbox()

const initial = computed(() => (settings.userName || '?').trim().charAt(0).toUpperCase())

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

const groups = computed(() => {
  const anchors = Object.keys(finance.monthlyIncomes || {}).length ? getSalaryAnchors() : []
  const newest = anchors[anchors.length - 1]
  const lastSalary = newest ? format(parseISO(newest.receivedDate), 'd MMM') : ''
  const activeCards = (cards.cards || []).filter(c => c.active !== false)
  const loans = finance.activeLoans
  const instLeft = finance.expenses.filter(e => e.isInstallment && e.category !== 'loans' && e.status !== 'paid')
  const instPlans = new Set(instLeft.map(e => e.installmentGroupId || e.name)).size
  const owedToYou = finance.expenses.filter(e => e.category === 'lend' && !e.collected && !e.writtenOff)
  return [
    {
      title: 'Money',
      items: [
        { to: '/sms-import', icon: 'sms', label: 'Bank SMS', meta: sms.fresh.value.length ? `${sms.fresh.value.length} new to add` : 'Add expenses from bank messages' },
        { to: '/wallets', icon: 'account_balance_wallet', label: 'Wallets and accounts', meta: accounts.tracking ? `LKR ${formatMoney(accounts.totalInLkr)} across ${plural(accounts.active.length, 'account')}` : 'Set up your LKR, dollar and cash wallets' },
        { to: '/salary', icon: 'work', label: 'Salary and cycles', meta: lastSalary ? `Last salary landed ${lastSalary}` : 'Record your salary when it lands' },
        { to: '/credit-cards', icon: 'credit_card', label: 'Credit cards', meta: activeCards.length ? `${plural(activeCards.length, 'card')} · LKR ${formatMoney(cards.totalOutstanding || 0)} owed` : 'No cards yet' },
        { to: '/installments', icon: 'event_repeat', label: 'Installments', meta: instPlans ? `${plural(instPlans, 'plan')} · LKR ${formatMoney(instLeft.reduce((s, e) => s + (e.amount || 0), 0))} left` : 'Plans paid monthly' },
        { to: '/loans', icon: 'account_balance', label: 'Loans', meta: loans.length ? `${plural(loans.length, 'loan')} · LKR ${formatMoney(finance.totalLoanDebt)} left` : 'No loans' },
        { to: '/lend-tracker', icon: 'group', label: 'Friends', meta: owedToYou.length ? `LKR ${formatMoney(owedToYou.reduce((s, e) => s + (e.amount || 0), 0))} owed to you` : 'Money friends owe you' },
        { to: '/fuel-tracker', icon: 'local_gas_station', label: 'Fuel', meta: 'Fill-ups and km per litre' }
      ]
    },
    {
      title: 'Reports',
      items: [
        { to: '/monthly-report', icon: 'bar_chart', label: 'Monthly report' },
        { to: '/payment-history', icon: 'history', label: 'Payment history' },
        { to: '/net-worth', icon: 'account_balance_wallet', label: 'Net worth' }
      ]
    },
    {
      title: 'Settings',
      items: [
        { to: '/profile', icon: 'person', label: 'Profile and preferences' },
        { to: '/custom-categories', icon: 'category', label: 'Categories' },
        { to: '/budget-limits', icon: 'tune', label: 'Spending limits' },
        { to: '/cloud-sync', icon: 'cloud', label: 'Cloud sync' },
        { to: '/backup', icon: 'settings_backup_restore', label: 'Backup and restore' },
        { to: '/trash', icon: 'delete', label: 'Recently deleted' }
      ]
    }
  ]
})
</script>

<style lang="scss" scoped>
.more-head { gap: 10px; }
.more-mark { width: 28px; height: 28px; flex: none; }

.more-user {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--raised);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  img { width: 100%; height: 100%; object-fit: cover; }
}

.more-version {
  margin-top: 24px;
  text-align: center;
  font-size: var(--fs-small);
  color: var(--muted);
}
</style>
