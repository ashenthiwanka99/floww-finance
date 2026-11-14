<template>
  <q-page>
    <PageHead title="Wallets" back>
      <button v-if="accounts.active.length" class="icon-btn" aria-label="Add an account" @click="openAccount('lkr')">
        <span class="material-symbols-outlined">add</span>
      </button>
    </PageHead>

    <section v-if="!accounts.active.length" class="panel panel--pad wallets-intro">
      <p class="wallets-intro__title">Track every account</p>
      <p class="wallets-intro__text">Put Nations Trust Bank, Commercial Bank and your cash into three wallets: LKR, dollars and cash. Type each balance once, and Floww keeps it from your records and bank SMS.</p>
      <router-link to="/wallets/setup" class="btn btn--primary">Set up wallets</router-link>
    </section>

    <template v-else>
      <section class="panel panel--pad">
        <p class="figure-label">All your money</p>
        <p class="figure figure--lead num"><span class="unit">LKR</span>{{ formatAmount(accounts.totalInLkr) }}</p>
        <p class="wallets-sub num">{{ totalLine }}</p>
        <dl v-if="owedOnCards > 0" class="wallets-sum num">
          <div><dt>Owed on credit cards</dt><dd>{{ money(owedOnCards) }}</dd></div>
          <div class="wallets-sum__total"><dt>After card bills</dt><dd>{{ money(accounts.totalInLkr - owedOnCards) }}</dd></div>
        </dl>
      </section>

      <div class="chips wallets-actions" role="group" aria-label="Record money">
        <button type="button" class="chip" @click="openIncome('salary')"><span class="material-symbols-outlined">work</span>Salary</button>
        <button type="button" class="chip" @click="openMove()"><span class="material-symbols-outlined">swap_horiz</span>Move</button>
        <button type="button" class="chip" @click="openIncome('other')"><span class="material-symbols-outlined">call_received</span>Money in</button>
      </div>

      <div v-if="needsBalance.length" class="notice notice--warning wallets-notice">
        <span class="material-symbols-outlined">info</span>
        <span>{{ needsBalance.map(a => a.name).join(', ') }} {{ needsBalance.length === 1 ? 'has' : 'have' }} no balance yet. Open {{ needsBalance.length === 1 ? 'it' : 'each one' }} and tap Check balance.</span>
      </div>

      <section v-for="w in sections" :key="w.key" class="section">
        <div class="section-head">
          <h2>{{ w.name }}</h2>
          <span class="wallets-total num">{{ money(w.total, w.currency) }}</span>
        </div>
        <div class="list">
          <AccountRow v-for="a in w.accounts" :key="a.id" :account="a" />
          <button v-if="!w.accounts.length" type="button" class="row" @click="openAccount(w.key)">
            <span class="row__icon material-symbols-outlined">add</span>
            <span class="row__main"><span class="row__title">Add an account</span></span>
          </button>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Credit cards</h2>
          <router-link to="/credit-cards">Manage</router-link>
        </div>
        <nav v-if="cardStore.activeCards.length" class="list">
          <router-link v-for="c in cardStore.activeCards" :key="c.id" :to="`/credit-cards/${c.id}`" class="row">
            <span class="row__icon material-symbols-outlined">credit_card</span>
            <span class="row__main">
              <span class="row__title">{{ c.name }}</span>
              <span class="row__meta num">{{ cardMeta(c) }}</span>
            </span>
            <span class="row__end row__amount num" :class="{ 'is-zero': !c.currentOutstanding }">{{ money(c.currentOutstanding || 0) }}</span>
          </router-link>
        </nav>
        <p v-else class="empty">No credit cards yet. Add your NTB cards so card spending is kept apart from your bank balance.</p>
        <div v-for="l in cardsOff" :key="l.key" class="notice notice--warning wallets-notice">
          <span class="material-symbols-outlined">warning</span>
          <span class="num">
            Your bank says {{ money(l.bank) }} is owed on {{ l.cards.map(c => c.name).join(' and ') }} ({{ day(l.at) }}). Floww has {{ money(l.floww) }}.
            <router-link v-if="l.waiting" to="/sms-import">Add {{ l.waiting }} card {{ l.waiting === 1 ? 'message' : 'messages' }}</router-link>
            <button v-else type="button" @click="acceptCard(l)">Accept the bank's figure</button>
          </span>
        </div>
      </section>

      <section v-if="archived.length" class="section">
        <div class="section-head"><h2>Hidden accounts</h2></div>
        <div class="list">
          <button v-for="a in archived" :key="a.id" type="button" class="row" @click="restore(a)">
            <span class="row__icon material-symbols-outlined">visibility_off</span>
            <span class="row__main">
              <span class="row__title">{{ a.name }}</span>
              <span class="row__meta">Tap to show it again</span>
            </span>
          </button>
        </div>
      </section>
    </template>

    <AccountSheet v-model="showAccount" :wallet="newWallet" />
    <IncomeSheet v-model="showIncome" :prefill="incomePrefill" />
    <TransferSheet v-model="showMove" />
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import PageHead from '../components/layout/PageHead.vue'
import AccountRow from '../components/accounts/AccountRow.vue'
import AccountSheet from '../components/accounts/AccountSheet.vue'
import IncomeSheet from '../components/accounts/IncomeSheet.vue'
import TransferSheet from '../components/accounts/TransferSheet.vue'
import { useAccountsStore } from '../stores/accountsStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { WALLETS, money, formatAmount } from '../utils/wallets'
import { showToast } from '../utils/toast'
import { format } from 'date-fns'
import { useBankChecks } from '../composables/useBankChecks'
import { useCloudSync } from '../composables/useCloudSync'

const accounts = useAccountsStore()
const cardStore = useCreditCardStore()
const { cardLines, cardsOff, acceptCardFigure } = useBankChecks()
const { syncNow } = useCloudSync()

const day = ts => format(new Date(ts), 'd MMM')

function cardMeta(c) {
  const parts = [c.issuer, c.last4 ? `••${c.last4}` : ''].filter(Boolean)
  const line = cardLines.value.find(l => l.cards.includes(c))
  if (line?.bank !== null && line?.bank !== undefined && Math.abs(line.diff) < 1) parts.push(`Matches bank, ${day(line.at)}`)
  return parts.join(' · ') || 'Credit card'
}

function acceptCard(line) {
  acceptCardFigure(line)
  syncNow()
  showToast('Cards now match your bank', 'paid')
}

const sections = computed(() =>
  WALLETS.map(w => ({ ...w, accounts: accounts.accountsIn(w.key), total: accounts.walletTotals[w.key] }))
)

const archived = computed(() => accounts.accounts.filter(a => a.archived))
const needsBalance = computed(() => accounts.active.filter(a => !a.openingAt))
const owedOnCards = computed(() => cardStore.totalOutstanding || 0)

const totalLine = computed(() => {
  const t = accounts.walletTotals
  const parts = [`${money(t.lkr)} in banks`, `${money(t.usd, 'USD')} in dollars`, `${money(t.cash)} in cash`]
  return `${parts.join(', ')}. Dollars at ${accounts.fxRate ? accounts.fxRate.toFixed(2) : 'the live rate'}.`
})

const showAccount = ref(false)
const newWallet = ref('lkr')
function openAccount(wallet) {
  newWallet.value = wallet
  showAccount.value = true
}

const showIncome = ref(false)
const incomePrefill = ref(null)
function openIncome(kind) {
  incomePrefill.value = { kind }
  showIncome.value = true
}

const showMove = ref(false)
function openMove() {
  showMove.value = true
}

function restore(a) {
  accounts.updateAccount(a.id, { archived: false })
  showToast(`${a.name} is back`, 'info')
}
</script>

<style lang="scss" scoped>
.wallets-intro__title { font-size: var(--fs-section); font-weight: 600; margin-bottom: 4px; }
.wallets-intro__text { color: var(--muted); margin-bottom: 16px; }

.wallets-sub { margin-top: 4px; color: var(--muted); font-size: var(--fs-small); line-height: 16px; }

.wallets-sum {
  margin: 12px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--rule);
  > div { display: flex; justify-content: space-between; padding: 4px 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
}
.wallets-sum__total { dt, dd { color: var(--text); font-weight: 600; } }

.wallets-actions { margin-top: 12px; flex-wrap: wrap; overflow: visible; }
.wallets-notice { margin-top: 12px; }
.wallets-total { font-weight: 600; font-size: var(--fs-body); }
</style>
