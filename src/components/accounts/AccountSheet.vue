<template>
  <BottomSheet :model-value="modelValue" :title="account ? 'Edit account' : 'Add an account'" @update:model-value="close">
    <form novalidate @submit.prevent="save">
      <div v-if="!account" class="field">
        <p class="field-label">Wallet</p>
        <div class="seg seg--block" role="group" aria-label="Wallet">
          <button v-for="w in WALLETS" :key="w.key" type="button" :aria-pressed="form.wallet === w.key" @click="setWallet(w.key)">{{ w.short }}</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="acct-name">Name</label>
        <input id="acct-name" v-model="form.name" type="text" class="field-input" :class="{ 'field-error': !!error }" placeholder="For example NTB savings" autocomplete="off" />
      </div>

      <template v-if="form.wallet !== 'cash'">
        <div class="field">
          <p class="field-label">Bank</p>
          <div class="chips acct-banks" role="radiogroup" aria-label="Bank">
            <button v-for="b in banks" :key="b.key" type="button" role="radio" class="chip" :class="{ on: form.institution === b.key }" :aria-checked="form.institution === b.key" @click="form.institution = b.key">{{ b.label }}</button>
          </div>
          <p class="field-help">Floww uses this to put bank SMS on the right account.</p>
        </div>

        <div class="field-row">
          <label class="field">
            <span class="field-label">Account no., last 4</span>
            <input v-model="form.numberLast4" type="text" inputmode="numeric" maxlength="4" class="field-input num" placeholder="5678" />
          </label>
          <label class="field">
            <span class="field-label">Debit card, last 4</span>
            <input v-model="form.cardLast4" type="text" inputmode="numeric" class="field-input num" placeholder="3456" />
          </label>
        </div>

        <div v-if="form.wallet === 'lkr'" class="switch-row">
          <span class="switch-row__text">
            <span class="switch-row__title">PayPal charges this account</span>
            <span class="switch-row__desc">PayPal shows as a way to pay, and the money comes out of here</span>
          </span>
          <button type="button" role="switch" class="switch" :aria-checked="form.paypal" aria-label="PayPal charges this account" @click="form.paypal = !form.paypal" />
        </div>
      </template>

      <div class="field">
        <label class="field-label" for="acct-balance">{{ account?.openingAt ? 'Starting balance' : 'Balance right now' }}</label>
        <div class="money-wrap">
          <span class="money-lkr">{{ currency === 'USD' ? '$' : 'LKR' }}</span>
          <MoneyInput id="acct-balance" v-model="form.balance" decimal placeholder="0" :error="false" />
        </div>
        <p class="field-help num">{{ balanceHelp }}</p>
      </div>

      <p v-if="error" class="field-error-msg">{{ error }}</p>

      <div class="btn-row">
        <button v-if="account" type="button" class="btn btn--danger" @click="remove">Remove</button>
        <button type="submit" class="btn btn--primary">{{ account ? 'Save changes' : 'Add account' }}</button>
      </div>
    </form>
  </BottomSheet>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'
import { format } from 'date-fns'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { useCloudSync } from '../../composables/useCloudSync'
import { showToast } from '../../utils/toast'
import { WALLETS, walletInfo } from '../../utils/wallets'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  account: { type: Object, default: null },
  wallet: { type: String, default: 'lkr' }
})
const emit = defineEmits(['update:modelValue', 'removed'])

const accounts = useAccountsStore()
const { syncNow } = useCloudSync()

const banks = [
  { key: 'ntb', label: 'Nations Trust Bank' },
  { key: 'combank', label: 'Commercial Bank' },
  { key: 'other', label: 'Other' }
]

const form = reactive({ wallet: 'lkr', name: '', institution: 'ntb', numberLast4: '', cardLast4: '', paypal: false, balance: null })
const error = ref('')

const currency = computed(() => walletInfo(form.wallet).currency)

const balanceHelp = computed(() => {
  const a = props.account
  if (a?.openingAt) return `What it held when tracking started on ${format(new Date(a.openingAt), 'd MMM yyyy')}. To match your bank today, use Check balance instead.`
  return 'Type what your bank shows today. Leave it empty to set it later.'
})

watch(() => props.modelValue, open => {
  if (!open) return
  error.value = ''
  const a = props.account
  if (a) {
    Object.assign(form, {
      wallet: a.wallet,
      name: a.name,
      institution: a.institution,
      numberLast4: a.numberLast4 || '',
      cardLast4: (a.cardLast4 || []).join(', '),
      paypal: !!a.paypal,
      balance: a.openingBalance
    })
  } else {
    Object.assign(form, { wallet: props.wallet, name: '', institution: props.wallet === 'cash' ? 'cash' : 'ntb', numberLast4: '', cardLast4: '', paypal: false, balance: null })
  }
})

function setWallet(key) {
  form.wallet = key
  form.institution = key === 'cash' ? 'cash' : (form.institution === 'cash' ? 'ntb' : form.institution)
  if (key !== 'lkr') form.paypal = false
}

function close() {
  emit('update:modelValue', false)
}

function save() {
  error.value = ''
  const payload = {
    name: form.name,
    institution: form.wallet === 'cash' ? 'cash' : form.institution,
    numberLast4: form.numberLast4,
    cardLast4: form.cardLast4,
    paypal: form.paypal,
    openingBalance: form.balance
  }
  const res = props.account
    ? accounts.updateAccount(props.account.id, payload)
    : accounts.addAccount({ ...payload, wallet: form.wallet })
  if (!res.success) { error.value = res.error || 'Could not save the account'; return }
  if (!props.account) accounts.setupComplete = true
  showToast(props.account ? 'Account saved' : `${form.name.trim()} added`, 'paid')
  syncNow()
  close()
}

function remove() {
  const res = accounts.removeAccount(props.account.id)
  showToast(res.archived ? `${props.account.name} hidden. Its history stays.` : `${props.account.name} removed`, 'info')
  syncNow()
  emit('removed')
  close()
}
</script>

<style lang="scss" scoped>
.acct-banks { flex-wrap: wrap; overflow: visible; }
</style>
