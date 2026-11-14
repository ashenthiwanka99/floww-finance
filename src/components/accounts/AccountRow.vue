<template>
  <router-link :to="`/accounts/${account.id}`" class="row acct-row">
    <span class="row__icon material-symbols-outlined">{{ icon }}</span>
    <span class="row__main">
      <span class="row__title">{{ account.name }}</span>
      <span class="row__meta num">{{ meta }}</span>
    </span>
    <span class="row__end acct-row__end">
      <span class="row__amount num" :class="{ 'is-zero': balance === null }">{{ balance === null ? 'Not set' : money(balance, account.currency) }}</span>
      <span v-if="status.state === 'off'" class="pill pill--warning num">Off by {{ money(Math.abs(status.diff), account.currency) }}</span>
      <span v-else-if="account.currency === 'USD' && balance && accounts.fxRate" class="acct-row__sub num">{{ money(balance * accounts.fxRate) }}</span>
    </span>
  </router-link>
</template>

<script setup>
import { computed } from 'vue'
import { format } from 'date-fns'
import { useAccountsStore } from '../../stores/accountsStore'
import { money, walletInfo, institutionShort } from '../../utils/wallets'

const props = defineProps({
  account: { type: Object, required: true }
})

const accounts = useAccountsStore()

const balance = computed(() => accounts.balanceOf(props.account.id))
const status = computed(() => accounts.statusOf(props.account.id))
const icon = computed(() => walletInfo(props.account.wallet).icon)

const meta = computed(() => {
  const a = props.account
  const parts = []
  if (a.wallet !== 'cash') {
    parts.push(institutionShort(a.institution))
    if (a.numberLast4) parts.push(`••${a.numberLast4}`)
    if (a.paypal) parts.push('PayPal')
  }
  const s = status.value
  if (s.state === 'matched') parts.push(`Matches bank, ${format(new Date(s.at), 'd MMM')}`)
  else if (s.state === 'unset') parts.push('Set the balance')
  else if (s.state === 'unchecked' && a.wallet !== 'cash') parts.push('Not checked yet')
  return parts.join(' · ')
})
</script>

<style lang="scss" scoped>
.acct-row__end { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.acct-row__sub { font-size: var(--fs-small); color: var(--muted); }
</style>
