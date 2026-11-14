<template>
  <q-page>
    <PageHead title="Set up wallets" back />
    <p class="page-sub">Type what each account holds right now, from your bank app. From then on Floww works out every balance from your records and checks it against your bank SMS.</p>

    <section v-for="w in sections" :key="w.key" class="section">
      <div class="section-head"><h2>{{ w.name }}</h2></div>
      <div class="list">
        <div v-for="row in w.rows" :key="row.key" class="setup-item">
          <div class="setup-item__head">
            <input v-model="row.name" type="text" class="setup-item__name" :aria-label="`Name for ${row.name}`" :disabled="!row.include" />
            <button
              type="button"
              role="switch"
              class="switch"
              :aria-checked="row.include"
              :aria-label="`Track ${row.name}`"
              @click="row.include = !row.include"
            />
          </div>
          <p class="setup-item__meta">{{ row.meta }}</p>
          <template v-if="row.include">
            <div class="field setup-item__field">
              <span class="field-label">Balance right now</span>
              <div class="money-wrap" :class="{ 'money-wrap--error': !!errors[row.key] }">
                <span class="money-lkr">{{ w.currency === 'USD' ? '$' : 'LKR' }}</span>
                <MoneyInput v-model="row.balance" decimal placeholder="0" :error="false" :aria-label="`Balance of ${row.name}`" />
              </div>
              <p v-if="errors[row.key]" class="field-error-msg">{{ errors[row.key] }}</p>
              <p v-else-if="row.smsAt && Number(row.balance) === row.smsBalance" class="field-help num">From your bank's SMS on {{ format(new Date(row.smsAt), 'd MMM, h:mm a') }}. Anything after that message is counted.</p>
            </div>
            <div v-if="w.key !== 'cash'" class="field-row">
              <label class="field setup-item__field">
                <span class="field-label">Account no., last 4</span>
                <input v-model="row.numberLast4" type="text" inputmode="numeric" maxlength="4" class="field-input num" placeholder="Optional" />
              </label>
              <label v-if="w.key === 'lkr'" class="field setup-item__field">
                <span class="field-label">Debit card, last 4</span>
                <input v-model="row.cardLast4" type="text" inputmode="numeric" maxlength="4" class="field-input num" placeholder="Optional" />
              </label>
            </div>
            <div v-if="row.paypalOption" class="switch-row">
              <span class="switch-row__text">
                <span class="switch-row__title">PayPal charges this card</span>
                <span class="switch-row__desc">Pay through PayPal and the money comes out of here</span>
              </span>
              <button type="button" role="switch" class="switch" :aria-checked="row.paypal" aria-label="PayPal charges this card" @click="row.paypal = !row.paypal" />
            </div>
          </template>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Credit cards</h2>
        <router-link to="/credit-cards">{{ cardStore.activeCards.length ? 'Manage' : 'Add cards' }}</router-link>
      </div>
      <p class="setup-cards num">{{ cardsLine }}</p>
    </section>

    <p class="field-help setup-hint">The last 4 digits let Floww put each bank SMS on the right account. {{ smsHint }}</p>

    <button type="button" class="btn btn--primary btn--block setup-save" @click="save">Start tracking</button>
  </q-page>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { format } from 'date-fns'
import { useRouter } from 'vue-router'
import PageHead from '../components/layout/PageHead.vue'
import MoneyInput from '../components/shared/MoneyInput.vue'
import { useAccountsStore } from '../stores/accountsStore'
import { useFinanceStore } from '../stores/financeStore'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useSmsInbox } from '../composables/useSmsInbox'
import { useCloudSync } from '../composables/useCloudSync'
import { WALLETS, lastDigits } from '../utils/wallets'
import { latestBalanceSms } from '../utils/smsReconcile'
import { showToast } from '../utils/toast'

const router = useRouter()
const accounts = useAccountsStore()
const finance = useFinanceStore()
const cardStore = useCreditCardStore()
const { transactions } = useSmsInbox()
const { syncNow } = useCloudSync()

onMounted(() => {
  if (accounts.active.length) router.replace('/wallets')
})

function fromSms(test) {
  const tx = [...transactions.value].sort((a, b) => (b.smsDate || 0) - (a.smsDate || 0)).find(test)
  return tx || null
}

const creditTails = new Set((cardStore.activeCards || []).map(c => lastDigits(c.last4)))
const withBalance = tx => tx.balanceKind === 'account' && typeof tx.balance === 'number'
function latestFor(test) {
  const list = transactions.value.filter(tx => test(tx) && withBalance(tx))
  const best = latestBalanceSms(list)
  if (!best) return null
  return { ...best, smsDate: Math.max(...list.filter(t => Math.abs(t.smsDate - best.smsDate) <= 300000).map(t => t.smsDate)) }
}
const ntbLkr = latestFor(tx => /Nations/i.test(tx.bank || '') && tx.account && (tx.currency || 'LKR') === 'LKR')
const ntbUsd = latestFor(tx => /Nations/i.test(tx.bank || '') && tx.account && tx.currency === 'USD')
const comAcct = fromSms(tx => /Commercial/i.test(tx.bank || '') && tx.account)
const comCard = fromSms(tx => /Commercial/i.test(tx.bank || '') && tx.card && !creditTails.has(lastDigits(tx.card)))

const rows = reactive([
  {
    key: 'usd', wallet: 'usd', include: true, name: 'NTB dollar account', institution: 'ntb',
    meta: 'Nations Trust Bank. Your salary lands here.',
    balance: ntbUsd ? ntbUsd.balance : (finance.usdAccount?.openingDate ? finance.usdBalance : null),
    smsBalance: ntbUsd?.balance ?? null, smsAt: ntbUsd?.smsDate ?? null,
    numberLast4: ntbUsd ? lastDigits(ntbUsd.account) : '', cardLast4: ''
  },
  {
    key: 'ntb', wallet: 'lkr', include: true, name: 'NTB rupee account', institution: 'ntb',
    meta: 'Nations Trust Bank, with your NTB debit card.',
    balance: ntbLkr?.balance ?? null,
    smsBalance: ntbLkr?.balance ?? null, smsAt: ntbLkr?.smsDate ?? null,
    numberLast4: ntbLkr ? lastDigits(ntbLkr.account) : '', cardLast4: ''
  },
  {
    key: 'combank', wallet: 'lkr', include: true, name: 'Commercial Bank', institution: 'combank',
    meta: 'Commercial Bank, with your debit card.', paypalOption: true, paypal: true,
    balance: null, numberLast4: comAcct ? lastDigits(comAcct.account) : '', cardLast4: comCard ? lastDigits(comCard.card) : ''
  },
  {
    key: 'cash', wallet: 'cash', include: true, name: 'Cash on hand', institution: 'cash',
    meta: 'Notes and coins in your wallet.',
    balance: Math.max(0, Math.round(finance.cashOnHand || 0)) || null,
    numberLast4: '', cardLast4: ''
  }
])

const sections = computed(() => WALLETS.map(w => ({ ...w, rows: rows.filter(r => r.wallet === w.key) })))
const errors = ref({})

const cardsLine = computed(() => {
  const list = cardStore.activeCards || []
  if (!list.length) return 'No credit cards yet. Add your two NTB credit cards so card spending stays apart from your bank balance until you pay the bill.'
  return `${list.map(c => (c.last4 ? `${c.name} ••${c.last4}` : c.name)).join(', ')}. Card spending is owed, and leaves a bank account only when you pay the bill.`
})

const smsHint = computed(() => (ntbLkr || comCard ? 'Some were filled in from your recent bank SMS.' : 'You can add them later from each account.'))

function save() {
  errors.value = {}
  const chosen = rows.filter(r => r.include)
  if (!chosen.length) { showToast('Switch on at least one account', 'error'); return }
  for (const r of chosen) {
    if (r.balance === null || r.balance === undefined || Number.isNaN(Number(r.balance))) errors.value[r.key] = 'Type the balance, or switch this account off'
    if (!String(r.name || '').trim()) errors.value[r.key] = 'Give it a name'
  }
  if (Object.keys(errors.value).length) return
  const at = Date.now()
  chosen.forEach((r, i) => {
    accounts.addAccount({
      name: r.name,
      wallet: r.wallet,
      institution: r.institution,
      numberLast4: r.numberLast4,
      cardLast4: r.cardLast4,
      paypal: !!r.paypal,
      openingBalance: Number(r.balance),
      openingAt: r.smsAt && Number(r.balance) === r.smsBalance ? r.smsAt : at,
      order: i
    })
  })
  accounts.setupComplete = true
  syncNow()
  showToast('Wallets ready. Every record now moves a balance.', 'paid')
  router.replace('/wallets')
}
</script>

<style lang="scss" scoped>
.setup-item {
  padding: 12px var(--card-pad) 4px;
  & + .setup-item { border-top: 1px solid var(--rule); }
}

.setup-item__head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setup-item__name {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font-size: var(--fs-section);
  font-weight: 600;
  outline: none;
  &:disabled { color: var(--muted); }
  &:focus { box-shadow: inset 0 -1px 0 var(--text); }
}

.setup-item__meta { color: var(--muted); font-size: var(--fs-small); line-height: 16px; margin: 0 0 12px; }
.setup-item__field { margin-bottom: 12px; }

.setup-cards { color: var(--muted); }
.setup-hint { margin-top: 20px; }
.setup-save { margin-top: 16px; }
</style>
