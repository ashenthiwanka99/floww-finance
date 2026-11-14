<template>
  <BottomSheet :model-value="modelValue" :title="account ? `Check ${account.name}` : 'Check balance'" @update:model-value="close">
    <template v-if="account && !result">
      <p class="check-text">{{ opened ? `Open your ${bankName} app and type the balance it shows right now.` : `What is in ${account.name} right now? From here on Floww keeps the balance for you.` }}</p>
      <form novalidate @submit.prevent="check">
        <div class="field">
          <label class="field-label" for="check-amount">{{ opened ? 'Balance your bank shows' : 'Balance right now' }}</label>
          <div class="money-wrap money-wrap--big" :class="{ 'money-wrap--error': !!error }">
            <span class="money-lkr">{{ account.currency === 'USD' ? '$' : 'LKR' }}</span>
            <MoneyInput id="check-amount" v-model="amount" decimal placeholder="0" :error="false" />
          </div>
          <p v-if="error" class="field-error-msg">{{ error }}</p>
          <p v-if="opened" class="field-help num">Floww has {{ money(current, account.currency) }}.</p>
        </div>
        <button type="submit" class="btn btn--primary btn--block">{{ opened ? 'Check' : 'Save balance' }}</button>
      </form>
    </template>

    <template v-else-if="account && result">
      <div v-if="result.opened || Math.abs(result.diff) < 1" class="check-result">
        <span class="material-symbols-outlined check-result__icon">check_circle</span>
        <p class="check-result__title">{{ result.opened ? 'Balance saved' : 'It matches' }}</p>
        <p class="check-text num">{{ result.opened ? `Floww now tracks ${account.name} from ${money(amount, account.currency)}.` : `Floww and your bank both say ${money(amount, account.currency)}. Every record is in.` }}</p>
        <button type="button" class="btn btn--primary btn--block" @click="close">Done</button>
      </div>
      <div v-else class="check-result">
        <p class="check-result__title num">Off by {{ money(Math.abs(result.diff), account.currency) }}</p>
        <dl class="check-sums num">
          <div><dt>Your bank</dt><dd>{{ money(amount, account.currency) }}</dd></div>
          <div><dt>Floww</dt><dd>{{ money(result.app, account.currency) }}</dd></div>
        </dl>
        <p class="check-text">{{ result.diff < 0 ? `More went out than Floww knows about. Look for a payment, fee or withdrawal you have not added.` : `More came in than Floww knows about. Look for money in or a refund you have not added.` }}</p>
        <div class="check-actions">
          <button type="button" class="btn btn--primary btn--block" @click="addMissing">{{ result.diff < 0 ? 'Add the missing payment' : 'Add the missing money in' }}</button>
          <button type="button" class="btn btn--outline btn--block" @click="correct">Accept the bank's figure</button>
          <button type="button" class="btn btn--ghost btn--block" @click="close">Not now</button>
        </div>
        <p class="field-help">Accepting adds a correction of {{ signedMoney(result.diff, account.currency) }} so Floww matches your bank. It shows in the account history.</p>
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch, inject } from 'vue'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { useCloudSync } from '../../composables/useCloudSync'
import { showToast } from '../../utils/toast'
import { money, signedMoney, INSTITUTIONS } from '../../utils/wallets'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  accountId: { type: String, default: '' },
  bankBalance: { type: Number, default: null },
  at: { type: Number, default: null }
})
const emit = defineEmits(['update:modelValue'])

const accounts = useAccountsStore()
const { syncNow } = useCloudSync()
const openRecord = inject('openExpenseSheet', null)

const account = computed(() => accounts.getAccount(props.accountId))
const opened = computed(() => !!account.value?.openingAt)
const current = computed(() => accounts.balanceOf(props.accountId) || 0)
const bankName = computed(() => (INSTITUTIONS[account.value?.institution] || INSTITUTIONS.other).name.replace('Other bank', 'bank'))

const amount = ref(null)
const error = ref('')
const result = ref(null)
const checkedAt = ref(null)

watch(() => props.modelValue, open => {
  if (!open) return
  error.value = ''
  result.value = null
  amount.value = props.bankBalance
  checkedAt.value = props.at
  if (props.bankBalance !== null) check()
})

function check() {
  if (amount.value === null || amount.value === undefined || Number.isNaN(Number(amount.value))) {
    error.value = 'Type the balance'
    return
  }
  const at = checkedAt.value || Date.now()
  checkedAt.value = at
  result.value = accounts.checkBalance(props.accountId, Number(amount.value), at)
  syncNow()
}

function correct() {
  accounts.addCorrection({ accountId: props.accountId, amount: result.value.diff, at: checkedAt.value, note: 'Matched to the bank balance' })
  showToast(`${account.value.name} now matches your bank`, 'paid')
  syncNow()
  close()
}

function addMissing() {
  const diff = Math.abs(result.value.diff)
  const a = account.value
  close()
  if (!openRecord) return
  if (result.value.diff < 0) openRecord({ mode: 'expense', source: `acct:${a.id}`, amount: a.currency === 'USD' ? null : diff })
  else openRecord({ mode: 'income', account: `acct:${a.id}`, amount: diff })
}

function close() {
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
.check-text { color: var(--muted); margin-bottom: 16px; }

.check-result { text-align: left; }
.check-result__icon { font-size: 32px; color: var(--positive); margin-bottom: 8px; }
.check-result__title { font-size: var(--fs-title); line-height: 30px; font-weight: 600; margin-bottom: 8px; }

.check-sums {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: var(--radius-card);
  background: var(--raised);
  > div { display: flex; justify-content: space-between; padding: 4px 0; }
  dt { color: var(--muted); }
  dd { margin: 0; font-weight: 500; }
}

.check-actions { display: grid; gap: 8px; margin-bottom: 12px; }
</style>
