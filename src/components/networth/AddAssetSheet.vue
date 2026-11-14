<template>
  <BottomSheet v-model="show" title="Add asset">
    <label class="field">
      <span class="field-label">Name</span>
      <input v-model="form.name" type="text" class="field-input" placeholder="Commercial Bank savings" />
    </label>

    <p v-if="accounts.tracking" class="field-help asset-help">Bank accounts and cash live in your wallets now. Add investments here, such as a fixed deposit or shares.</p>

    <div v-else class="field">
      <p class="field-label">Type</p>
      <div class="seg seg--block" role="group" aria-label="Type">
        <button v-for="t in types" :key="t.value" :aria-pressed="form.type === t.value" @click="form.type = t.value">{{ t.label }}</button>
      </div>
    </div>

    <label class="field">
      <span class="field-label">Balance</span>
      <span class="money-wrap">
        <span class="money-lkr">LKR</span>
        <MoneyInput v-model="form.balance" placeholder="0" />
      </span>
    </label>

    <button class="btn btn--primary btn--block" :disabled="!canSave" @click="handleSubmit">Add asset</button>
  </BottomSheet>
</template>

<script setup>
import { reactive, computed } from 'vue'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { useFinanceStore } from '../../stores/financeStore'
import { useAccountsStore } from '../../stores/accountsStore'
import { useCloudSync } from '../../composables/useCloudSync'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])
const financeStore = useFinanceStore()
const accounts = useAccountsStore()
const { syncNow } = useCloudSync()

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const form = reactive({ name: '', type: 'bank', balance: null })

const types = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'investment', label: 'Investment' }
]

const canSave = computed(() => form.name.trim() && form.balance > 0)

function handleSubmit() {
  if (!canSave.value) return
  financeStore.addAsset({ name: form.name.trim(), type: accounts.tracking ? 'investment' : form.type, balance: form.balance })
  syncNow()
  form.name = ''
  form.balance = null
  form.type = 'bank'
  show.value = false
}
</script>

<style lang="scss" scoped>
.money-wrap :deep(.money-input) { color: var(--text); font-size: 16px; font-family: var(--font); }
.asset-help { margin: -4px 0 16px; }
</style>
