<template>
  <div class="chips pay-picker" role="radiogroup" aria-label="Paid from">
    <button
      v-for="m in methods"
      :key="m.value"
      type="button"
      role="radio"
      class="chip"
      :class="{ on: selectedMethod === m.value }"
      :aria-checked="selectedMethod === m.value"
      @click="emit('update:modelValue', m.value)"
    >
      <span class="material-symbols-outlined">{{ m.icon }}</span>{{ m.label }}<span v-if="m.last4" class="num pay-picker__last4">{{ m.last4 }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCreditCardStore } from '../../stores/creditCardStore'

const props = defineProps({
  // 'bank' (default), 'cash', or a card id
  modelValue: { type: String, default: 'bank' }
})

const emit = defineEmits(['update:modelValue'])

const cardStore = useCreditCardStore()
const selectedMethod = computed(() => props.modelValue || 'bank')

const methods = computed(() => [
  { value: 'bank', label: 'Bank', icon: 'account_balance' },
  { value: 'cash', label: 'Cash', icon: 'payments' },
  ...(cardStore.activeCards || []).map(c => ({ value: c.id, label: c.name, icon: 'credit_card', last4: c.last4 }))
])
</script>

<style lang="scss" scoped>
.pay-picker { flex-wrap: wrap; overflow: visible; }
.pay-picker__last4 { opacity: 0.7; margin-left: 2px; }
</style>
