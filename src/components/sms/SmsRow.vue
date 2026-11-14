<template>
  <div class="row sms-row" :class="{ 'sms-row--done': state }" role="button" tabindex="0" @click="$emit('open', tx)" @keydown.enter="$emit('open', tx)">
    <span class="row__icon material-symbols-outlined">{{ d.icon || 'receipt_long' }}</span>
    <span class="row__main">
      <span class="row__title">{{ d.name }}</span>
      <span class="row__meta num">
        {{ meta }}<span v-if="unsure" class="sms-row__unsure"> · check category</span>
      </span>
    </span>
    <span class="row__end row__amount num">{{ amountText }}</span>
    <span v-if="state" class="pill" :class="state === 'added' ? 'pill--positive' : ''">{{ state === 'added' ? 'Added' : 'Skipped' }}</span>
    <button v-else type="button" class="btn btn--outline btn--small sms-row__add" :aria-label="`Add ${d.name}, ${amountText}`" @click.stop="$emit('add', tx)">Add</button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { format, parseISO, isValid } from 'date-fns'
import { categoryLabel } from '../../utils/categoryConfig'
import { formatAmount } from '../../utils/wallets'
import { useSmsInbox } from '../../composables/useSmsInbox'
import { useSmsImportStore } from '../../stores/smsImportStore'
import { useAccountsStore } from '../../stores/accountsStore'
import { useCreditCardStore } from '../../stores/creditCardStore'

const props = defineProps({
  tx: { type: Object, required: true },
  state: { type: String, default: null }
})
defineEmits(['open', 'add'])

const { draft } = useSmsInbox()
const smsStore = useSmsImportStore()
const accounts = useAccountsStore()
const cards = useCreditCardStore()

const d = computed(() => draft(props.tx))
const unsure = computed(() => !props.state && d.value.kind === 'expense' && props.tx.confidence === 'low' && !smsStore.hasPendingEdit(props.tx.fingerprint))
const when = computed(() => {
  try { return format(new Date(props.tx.smsDate), 'd MMM, h:mm a') } catch { return '' }
})

const meta = computed(() => {
  const v = d.value
  const likely = props.tx.likely
  if (likely && !props.state) {
    const day = likely.date && isValid(parseISO(likely.date)) ? format(parseISO(likely.date), 'd MMM') : ''
    return [`Looks like ${likely.name}`, day, when.value].filter(Boolean).join(' · ')
  }
  const name = id => accounts.getAccount(id)?.name
  if (v.kind === 'income') return [v.incomeKind === 'salary' ? 'Salary' : 'Money in', name(v.accountId), when.value].filter(Boolean).join(' · ')
  if (v.kind === 'refund') return ['Refund on card', cards.getCard(v.cardId)?.name, when.value].filter(Boolean).join(' · ')
  if (v.kind === 'move') {
    const to = v.toCardId ? cards.getCard(v.toCardId)?.name : name(v.toAccountId)
    return [name(v.accountId) || 'Pick the account', to ? `to ${to}` : '', when.value].filter(Boolean).join(' · ')
  }
  return [categoryLabel(v.category), accounts.sourceLabel(v), when.value].filter(Boolean).join(' · ')
})

const amountText = computed(() => {
  const v = d.value
  const cur = v.kind === 'expense' || v.kind === 'refund' ? 'LKR' : (v.currency || 'LKR')
  const value = `${cur === 'USD' ? '$' : ''}${formatAmount(v.amount, cur)}`
  return v.kind === 'income' || v.kind === 'refund' ? `+${value}` : value
})
</script>

<style lang="scss" scoped>
.sms-row__unsure { color: var(--warning); }
.sms-row__add { flex: none; margin-left: 4px; }
.sms-row--done .row__title, .sms-row--done .row__amount { color: var(--muted); }
</style>
