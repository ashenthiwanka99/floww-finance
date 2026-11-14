<template>
  <div class="acct-picker">
    <div class="chips acct-picker__chips" role="radiogroup" :aria-label="label">
      <button
        v-for="o in options"
        :key="o.value"
        type="button"
        role="radio"
        class="chip"
        :class="{ on: modelValue === o.value }"
        :aria-checked="modelValue === o.value"
        @click="emit('update:modelValue', o.value)"
      >
        <span class="material-symbols-outlined">{{ o.icon }}</span>{{ o.label }}<span v-if="o.last4" class="num acct-picker__last4">{{ o.last4 }}</span>
      </button>
    </div>
    <p v-if="hint" class="field-help num">{{ hint }}</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { useCreditCardStore } from '../../stores/creditCardStore'
import { money, walletInfo } from '../../utils/wallets'

const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: 'Paid from' },
  cards: { type: Boolean, default: true },
  paypal: { type: Boolean, default: true },
  wallets: { type: Array, default: () => ['lkr', 'cash', 'usd'] },
  exclude: { type: String, default: '' },
  showHint: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue'])

const accounts = useAccountsStore()
const cardStore = useCreditCardStore()

const options = computed(() => {
  const list = []
  if (!accounts.active.length) {
    list.push({ value: 'bank', label: 'Bank', icon: 'account_balance' })
    if (props.wallets.includes('cash')) list.push({ value: 'cash', label: 'Cash', icon: 'payments' })
  } else {
    for (const key of props.wallets) {
      for (const a of accounts.accountsIn(key)) {
        if (a.id === props.exclude) continue
        list.push({ value: `acct:${a.id}`, label: a.name, icon: walletInfo(a.wallet).icon })
        if (props.paypal && a.paypal) list.push({ value: `paypal:${a.id}`, label: 'PayPal', icon: 'public' })
      }
    }
  }
  if (props.cards) {
    for (const c of cardStore.activeCards || []) {
      list.push({ value: `card:${c.id}`, label: c.name, icon: 'credit_card', last4: c.last4 })
    }
  }
  return list
})

const hint = computed(() => {
  if (!props.showHint) return ''
  const v = props.modelValue || ''
  if (v.startsWith('card:')) {
    const c = cardStore.getCard(v.slice(5))
    return c ? `${money(c.currentOutstanding || 0)} owed on this card` : ''
  }
  if (v.startsWith('paypal:')) {
    const a = accounts.getAccount(v.slice(7))
    return a ? `Charged through PayPal to ${a.name}` : ''
  }
  if (v.startsWith('acct:')) {
    const a = accounts.getAccount(v.slice(5))
    if (!a) return ''
    const b = accounts.balanceOf(a.id)
    return b === null ? `${a.name}: balance not set yet` : `${a.name} has ${money(b, a.currency)}`
  }
  return ''
})
</script>

<style lang="scss" scoped>
.acct-picker__chips { flex-wrap: wrap; overflow: visible; }
.acct-picker__last4 { opacity: 0.7; margin-left: 2px; }
</style>
