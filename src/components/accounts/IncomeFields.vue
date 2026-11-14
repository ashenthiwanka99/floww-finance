<template>
  <div>
    <div class="field">
      <div class="seg seg--block" role="group" aria-label="What came in">
        <button type="button" :aria-pressed="form.kind === 'salary'" @click="setKind('salary')">Salary</button>
        <button type="button" :aria-pressed="form.kind === 'other'" @click="setKind('other')">Other money</button>
      </div>
    </div>

    <div class="field">
      <label class="field-label" :for="`${uid}-amount`">Amount</label>
      <div class="money-wrap money-wrap--big" :class="{ 'money-wrap--error': !!errors.amount }">
        <span class="money-lkr">{{ currency === 'USD' ? '$' : 'LKR' }}</span>
        <MoneyInput :id="`${uid}-amount`" v-model="form.amount" decimal placeholder="0" :error="false" />
      </div>
      <p v-if="errors.amount" class="field-error-msg">{{ errors.amount }}</p>
    </div>

    <div class="field">
      <p class="field-label">Went into</p>
      <AccountPicker v-model="form.account" :cards="false" :paypal="false" label="Went into" />
      <p v-if="errors.account" class="field-error-msg">{{ errors.account }}</p>
    </div>

    <div v-if="form.kind === 'other'" class="field">
      <label class="field-label" :for="`${uid}-name`">Where it came from</label>
      <input :id="`${uid}-name`" v-model="form.name" type="text" class="field-input" placeholder="For example freelance, refund, gift" autocomplete="off" />
    </div>

    <div class="field">
      <label class="field-label" :for="`${uid}-date`">{{ form.kind === 'salary' ? 'Day it landed' : 'Date' }}</label>
      <input :id="`${uid}-date`" v-model="form.date" type="date" class="field-input num" :class="{ 'field-error': !!errors.date }" />
      <p v-if="cycleNote" class="field-help">{{ cycleNote }}</p>
    </div>

    <div class="field">
      <label class="field-label" :for="`${uid}-note`">Note</label>
      <textarea :id="`${uid}-note`" v-model="form.note" class="field-input" rows="2" placeholder="Optional" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { format, parseISO, isValid } from 'date-fns'
import MoneyInput from '../shared/MoneyInput.vue'
import AccountPicker from './AccountPicker.vue'
import { useAccountsStore } from '../../stores/accountsStore'

const props = defineProps({
  form: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  cycleMonth: { type: String, default: undefined },
  uid: { type: String, default: 'inc' }
})

const accounts = useAccountsStore()

const account = computed(() => accounts.getAccount(String(props.form.account || '').replace(/^acct:/, '')))
const currency = computed(() => account.value?.currency || 'LKR')

function setKind(kind) {
  if (props.form.kind === kind) return
  const usd = accounts.defaultUsd
  const lkr = accounts.defaultLkr
  const current = String(props.form.account || '')
  if (kind === 'salary' && usd && (!current || current === `acct:${lkr?.id}`)) props.form.account = `acct:${usd.id}`
  if (kind === 'other' && lkr && (!current || current === `acct:${usd?.id}`)) props.form.account = `acct:${lkr.id}`
  props.form.kind = kind
}

const cycleNote = computed(() => {
  if (props.form.kind !== 'salary' || !props.form.date) return ''
  const d = parseISO(props.form.date)
  if (!isValid(d)) return ''
  const month = props.cycleMonth !== undefined ? props.cycleMonth : accounts.nextCycleFor(props.form.date)
  if (!month) return 'This is older than your last salary, so it is kept as money in and does not start a new cycle.'
  const [y, m] = month.split('-').map(Number)
  return `Starts your ${format(new Date(y, m - 1), 'MMMM')} cycle. Spending from ${format(d, 'd MMM')} counts against it.`
})
</script>
