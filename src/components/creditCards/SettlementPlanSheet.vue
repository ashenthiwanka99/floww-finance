<template>
  <BottomSheet
    :model-value="modelValue"
    title="Settlement plan"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form v-if="card" @submit.prevent="handleSave">
      <p class="field-help sp-context num">
        How you usually settle {{ card.name }} each cycle. It sets the reminder and the report. {{ isLinked ? 'Shared line' : 'Owed' }} now: LKR {{ formatMoney(lineOutstanding) }}.
      </p>

      <div class="field">
        <span class="field-label">Pay each cycle</span>
        <div class="seg seg--block" role="group" aria-label="Pay each cycle">
          <button
            v-for="opt in strategies"
            :key="opt.value"
            type="button"
            :aria-pressed="form.strategy === opt.value"
            @click="form.strategy = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div v-if="form.strategy === 'custom'" class="field">
        <label class="field-label" for="sp-amount">Amount</label>
        <div class="money-wrap">
          <span class="money-lkr">LKR</span>
          <MoneyInput id="sp-amount" v-model="form.customAmount" class="field-input num" placeholder="0" :error="false" />
        </div>
      </div>

      <label class="field">
        <span class="field-label">Pay on day</span>
        <input v-model.number="form.settlementDay" type="number" min="1" max="31" class="field-input num" placeholder="27" />
        <span class="field-help">You are reminded before this day.</span>
      </label>

      <p class="notice sp-preview num">
        <span class="material-symbols-outlined">event_repeat</span>
        <span>Pays LKR {{ formatMoney(previewAmount) }} on day {{ form.settlementDay || card.paymentDueDay || 27 }} of each cycle.</span>
      </p>

      <div class="btn-row">
        <button v-if="hasPlan" type="button" class="btn btn--danger" @click="handleClear">Remove plan</button>
        <button type="submit" class="btn btn--primary" :disabled="saving">{{ saving ? 'Saving' : 'Save plan' }}</button>
      </div>
    </form>
  </BottomSheet>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { showToast } from '../../utils/toast'
import { formatMoney } from '../../utils/format'
import { useCreditCardStore } from '../../stores/creditCardStore'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  card: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue'])

const cardStore = useCreditCardStore()

const strategies = [
  { value: 'full', label: 'All' },
  { value: 'half', label: 'Half' },
  { value: 'min', label: 'Minimum' },
  { value: 'custom', label: 'Custom' }
]

const form = reactive({
  strategy: 'full',
  customAmount: null,
  settlementDay: 27
})
const saving = ref(false)

const isLinked = computed(() => !!props.card?.creditLineId)
const lineOutstanding = computed(() =>
  props.card ? cardStore.creditLineOutstanding(props.card) : 0
)
const hasPlan = computed(() => props.card ? !!cardStore.getSettlementPlan(props.card) : false)

const previewAmount = computed(() => {
  const out = lineOutstanding.value
  switch (form.strategy) {
    case 'half': return Math.round(out / 2)
    case 'min': return Math.round(out * ((props.card?.minPaymentPercent || 5) / 100))
    case 'custom': return Math.min(out, Math.round(form.customAmount || 0))
    default: return out
  }
})

function handleSave() {
  if (saving.value || !props.card) return
  saving.value = true
  try {
    const res = cardStore.setSettlementPlan(props.card, {
      strategy: form.strategy,
      customAmount: form.customAmount,
      settlementDay: Math.min(31, Math.max(1, Math.floor(Number(form.settlementDay) || 27))),
      active: true
    })
    if (res?.success) {
      showToast('Settlement plan saved', 'paid')
      emit('update:modelValue', false)
    } else {
      showToast('Failed to save plan', 'error')
    }
  } finally {
    saving.value = false
  }
}

function handleClear() {
  if (!props.card) return
  cardStore.setSettlementPlan(props.card, { active: false })
  showToast('Settlement plan removed', 'info')
  emit('update:modelValue', false)
}

watch([() => props.modelValue, () => props.card], ([val, card]) => {
  if (val && card) {
    const existing = cardStore.getSettlementPlan(card)
    form.strategy = existing?.strategy || 'full'
    form.customAmount = existing?.customAmount || null
    form.settlementDay = existing?.settlementDay || card.paymentDueDay || 27
    saving.value = false
  }
})
</script>

<style lang="scss" scoped>
.sp-context { margin: 0 0 16px; font-size: var(--fs-body); line-height: 20px; }
.sp-preview { margin-top: 4px; }
</style>
