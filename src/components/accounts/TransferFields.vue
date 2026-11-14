<template>
  <div>
    <div v-if="presets.length > 1" class="chips move-presets" role="group" aria-label="Common moves">
      <button
        v-for="p in presets"
        :key="p.key"
        type="button"
        class="chip"
        :aria-pressed="activePreset === p.key"
        @click="applyPreset(p.key)"
      >{{ p.label }}</button>
    </div>

    <div class="field">
      <p class="field-label">From</p>
      <AccountPicker v-model="form.from" :cards="false" :paypal="false" label="From" />
      <p v-if="errors.from" class="field-error-msg">{{ errors.from }}</p>
    </div>

    <div class="field">
      <p class="field-label">To</p>
      <AccountPicker v-model="form.to" :paypal="false" :exclude="fromId" label="To" />
      <p v-if="errors.to" class="field-error-msg">{{ errors.to }}</p>
    </div>

    <div v-if="exchange" class="field-row">
      <div class="field">
        <label class="field-label" :for="`${uid}-sent`">Sent</label>
        <div class="money-wrap" :class="{ 'money-wrap--error': !!errors.amount }">
          <span class="money-lkr">{{ symbol(ends.from?.currency) }}</span>
          <MoneyInput :id="`${uid}-sent`" v-model="form.amount" decimal placeholder="0" :error="false" />
        </div>
        <p v-if="errors.amount" class="field-error-msg">{{ errors.amount }}</p>
      </div>
      <div class="field">
        <label class="field-label" :for="`${uid}-got`">Arrived</label>
        <div class="money-wrap" :class="{ 'money-wrap--error': !!errors.toAmount }">
          <span class="money-lkr">{{ symbol(ends.toCurrency) }}</span>
          <MoneyInput :id="`${uid}-got`" v-model="form.toAmount" decimal :placeholder="suggested" :error="false" />
        </div>
        <p v-if="errors.toAmount" class="field-error-msg">{{ errors.toAmount }}</p>
      </div>
    </div>

    <div v-else class="field">
      <label class="field-label" :for="`${uid}-amount`">Amount</label>
      <div class="money-wrap money-wrap--big" :class="{ 'money-wrap--error': !!errors.amount }">
        <span class="money-lkr">{{ symbol(ends.from?.currency) }}</span>
        <MoneyInput :id="`${uid}-amount`" v-model="form.amount" decimal placeholder="0" :error="false" />
      </div>
      <p v-if="errors.amount" class="field-error-msg">{{ errors.amount }}</p>
      <div v-if="ends.toCard && owed > 0" class="chips move-owed">
        <button type="button" class="chip" @click="form.amount = owed">All of it, {{ money(owed) }}</button>
        <button type="button" class="chip" @click="form.amount = Math.round(owed / 2)">Half</button>
      </div>
    </div>

    <div v-if="exchange && liveRate" class="move-rate num">
      <div><span class="move-rate__k">Live rate now</span><span>{{ liveRate.toFixed(2) }}</span></div>
      <div v-if="gotRate"><span class="move-rate__k">Rate you got</span><span>{{ gotRate.toFixed(2) }}</span></div>
      <p v-if="verdict" :class="`is-${verdict.tone}`">{{ verdict.text }}</p>
      <p v-else>Type what actually arrived. Banks usually pay a little under the live rate.</p>
    </div>

    <div class="field">
      <label class="field-label" :for="`${uid}-date`">Date</label>
      <input :id="`${uid}-date`" v-model="form.date" type="date" class="field-input num" :class="{ 'field-error': !!errors.date }" />
    </div>

    <div class="field">
      <label class="field-label" :for="`${uid}-note`">Note</label>
      <input :id="`${uid}-note`" v-model="form.note" type="text" class="field-input" placeholder="Optional" autocomplete="off" />
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import MoneyInput from '../shared/MoneyInput.vue'
import AccountPicker from './AccountPicker.vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { useCreditCardStore } from '../../stores/creditCardStore'
import { useMoneyRecords, blankMove } from '../../composables/useMoneyRecords'
import { money, formatAmount } from '../../utils/wallets'

const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  uid: { type: String, default: 'mv' }
})

const accounts = useAccountsStore()
const cardStore = useCreditCardStore()
const { moveEnds } = useMoneyRecords()

const symbol = c => (c === 'USD' ? '$' : 'LKR')
const fromId = computed(() => String(props.form.from || '').replace(/^acct:/, ''))
const ends = computed(() => moveEnds(props.form))
const exchange = computed(() => !!ends.value.from && !!ends.value.toCurrency && !ends.value.sameCurrency)
const owed = computed(() => Math.round(ends.value.toCard?.currentOutstanding || 0))

watch(() => props.form.from, () => {
  if (props.form.to === props.form.from) props.form.to = ''
})

const presets = computed(() => {
  const list = []
  if (accounts.defaultUsd && accounts.defaultLkr) list.push({ key: 'exchange', label: 'Dollars to LKR' })
  if (accounts.cashAccount && accounts.defaultLkr) list.push({ key: 'cash', label: 'Cash withdrawal' })
  if ((cardStore.activeCards || []).length && accounts.defaultLkr) list.push({ key: 'card', label: 'Pay a card' })
  if (accounts.accountsIn('lkr').length > 1) list.push({ key: 'banks', label: 'Between banks' })
  return list
})

const activePreset = computed(() => {
  const { from, to, toCard } = ends.value
  if (toCard) return 'card'
  if (!from || !to) return null
  if (from.wallet === 'usd' && to.wallet === 'lkr') return 'exchange'
  if (to.wallet === 'cash') return 'cash'
  if (from.wallet === 'lkr' && to.wallet === 'lkr') return 'banks'
  return null
})

function applyPreset(key) {
  const fresh = blankMove(accounts, key)
  props.form.from = fresh.from
  props.form.to = fresh.to
  props.form.toAmount = null
}

const liveRate = computed(() => Number(accounts.fxRate) || null)

const lkrPerUsd = (sent, got) => {
  const { from } = ends.value
  if (!(sent > 0) || !(got > 0)) return null
  return from?.currency === 'USD' ? got / sent : sent / got
}

const gotRate = computed(() => lkrPerUsd(Number(props.form.amount), Number(props.form.toAmount)))

const suggested = computed(() => {
  const sent = Number(props.form.amount) || 0
  if (!sent || !liveRate.value) return '0'
  const v = ends.value.from?.currency === 'USD' ? sent * liveRate.value : sent / liveRate.value
  return formatAmount(v, ends.value.toCurrency)
})

const verdict = computed(() => {
  if (!gotRate.value || !liveRate.value || ends.value.from?.currency !== 'USD') return null
  const diff = ((gotRate.value - liveRate.value) / liveRate.value) * 100
  const gap = Math.abs(diff).toFixed(1)
  if (diff >= -0.5) return { tone: 'positive', text: 'At or above the live rate, a good deal.' }
  if (diff >= -2.5) return { tone: 'muted', text: `${gap}% under the live rate, normal for a bank.` }
  return { tone: 'negative', text: `${gap}% under the live rate. A poor rate, worth checking.` }
})
</script>

<style lang="scss" scoped>
.move-presets { flex-wrap: wrap; overflow: visible; margin-bottom: 16px; }
.move-owed { margin-top: 8px; }

.move-rate {
  margin: -4px 0 16px;
  padding: 12px;
  border-radius: var(--radius-card);
  background: var(--raised);

  > div { display: flex; justify-content: space-between; padding: 2px 0; }
  .move-rate__k { color: var(--muted); }
  p { margin-top: 6px; font-size: var(--fs-small); line-height: 16px; color: var(--muted); }
  .is-muted { color: var(--muted); }
}
</style>
