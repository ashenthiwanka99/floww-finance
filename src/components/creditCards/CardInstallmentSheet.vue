<template>
  <BottomSheet
    :model-value="modelValue"
    title="Buy on card installment"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form @submit.prevent="handleSave">
      <p class="field-help ci-context">The full amount goes on the card now, then {{ clampedMonths }} monthly payments pay it down.</p>

      <div class="field">
        <span class="field-label">Card</span>
        <div class="chips ci-wrap">
          <button
            v-for="c in cardStore.activeCards"
            :key="c.id"
            type="button"
            class="chip"
            :class="{ on: form.cardId === c.id }"
            @click="form.cardId = c.id"
          >{{ c.name }}<span v-if="c.last4" class="num"> ••{{ c.last4 }}</span></button>
        </div>
      </div>

      <label class="field">
        <span class="field-label">What you bought</span>
        <input v-model="form.name" type="text" class="field-input" :class="{ 'field-error': !!errors.name }" placeholder="iPhone 16" />
        <span v-if="errors.name" class="field-error-msg">{{ errors.name }}</span>
      </label>

      <div class="field">
        <label class="field-label" for="ci-total">Total price</label>
        <div class="money-wrap" :class="{ 'money-wrap--error': !!errors.totalAmount }">
          <span class="money-lkr">LKR</span>
          <MoneyInput id="ci-total" v-model="form.totalAmount" class="field-input num" placeholder="0" :error="false" />
        </div>
        <span v-if="errors.totalAmount" class="field-error-msg">{{ errors.totalAmount }}</span>
      </div>

      <div class="field">
        <span class="field-label">Months</span>
        <div class="ci-months">
          <div class="seg" role="group" aria-label="Months">
            <button
              v-for="m in monthPresets"
              :key="m"
              type="button"
              :aria-pressed="clampedMonths === m"
              @click="form.months = m"
            >{{ m }}</button>
          </div>
          <input v-model.number="form.months" type="number" min="1" max="60" class="field-input num ci-months__input" aria-label="Other number of months" />
        </div>
      </div>

      <div class="field">
        <span class="field-label">Category</span>
        <div class="chips ci-wrap">
          <button
            v-for="cat in allCategories"
            :key="cat"
            type="button"
            class="chip"
            :class="{ on: form.category === cat }"
            @click="form.category = cat"
          >{{ categoryLabel(cat) }}</button>
        </div>
      </div>

      <label class="field">
        <span class="field-label">Bought on</span>
        <input v-model="form.startDate" type="date" class="field-input num" />
      </label>

      <div class="list ci-summary">
        <p class="row"><span class="row__main">On the card now</span><span class="row__amount num">{{ formatMoney(Number(form.totalAmount) || 0) }}</span></p>
        <p class="row"><span class="row__main">{{ clampedMonths }} payments of</span><span class="row__amount num">{{ emiPreview }}</span></p>
        <p class="row"><span class="row__main">First payment</span><span class="row__amount num">{{ firstEmiLabel }}</span></p>
      </div>

      <button type="submit" class="btn btn--primary btn--block" :disabled="saving">
        {{ saving ? 'Creating' : 'Create plan' }}
      </button>
    </form>
  </BottomSheet>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { format, addMonths, parseISO } from 'date-fns'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { showToast } from '../../utils/toast'
import { formatMoney } from '../../utils/format'
import { useCreditCardStore } from '../../stores/creditCardStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { defaultCategories, categoryLabel } from '../../utils/categoryConfig'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  card: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue'])

const cardStore = useCreditCardStore()
const settingsStore = useSettingsStore()

const form = reactive({
  cardId: null,
  name: '',
  totalAmount: null,
  months: 12,
  category: 'Shopping',
  startDate: format(new Date(), 'yyyy-MM-dd')
})
const errors = reactive({})
const saving = ref(false)

const monthPresets = [3, 6, 12, 24]

// Always clamp the display & submission to a sane 1..60 range.
const clampedMonths = computed(() => Math.min(60, Math.max(1, Math.floor(Number(form.months) || 1))))

const allCategories = computed(() => {
  const custom = (settingsStore.customCategories || []).map(c => c.name || c)
  // Drop categories that don't make sense for a card-installment purchase
  // (cash withdrawal, lend, savings, loans EMI, scheduled, credit cards).
  const excluded = new Set([
    'cashWithdrawal', 'lend', 'savings', 'loans', 'scheduled', 'creditCards', 'installments'
  ])
  return [...new Set([...defaultCategories, ...custom])].filter(c => !excluded.has(c))
})

// ── EMI maths ──
const emiNumber = computed(() => {
  const t = Number(form.totalAmount) || 0
  const m = clampedMonths.value
  return m ? Math.floor(t / m) : 0
})
const emiPreview = computed(() => formatMoney(emiNumber.value))

const firstEmiLabel = computed(() => {
  try {
    return format(addMonths(parseISO(form.startDate), 1), 'd MMM yyyy')
  } catch {
    return '-'
  }
})

async function handleSave() {
  if (saving.value) return
  Object.keys(errors).forEach(k => delete errors[k])
  if (!form.name?.trim()) { errors.name = 'Name is required'; return }
  if (!form.totalAmount || form.totalAmount <= 0) { errors.totalAmount = 'Amount must be greater than 0'; return }
  if (!form.cardId) { showToast('Pick a card first', 'error'); return }

  saving.value = true
  try {
    const res = await cardStore.createCardInstallmentPlan({
      cardId: form.cardId,
      name: form.name,
      totalAmount: Number(form.totalAmount),
      months: clampedMonths.value,
      category: form.category,
      startDate: form.startDate
    })
    if (res?.success) {
      showToast(`Installment plan created for ${form.name.trim()}`, 'paid')
      emit('update:modelValue', false)
    } else {
      showToast(res?.errors?.[0] || 'Failed to create plan', 'error')
    }
  } finally {
    saving.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    form.cardId = props.card?.id || cardStore.activeCards[0]?.id || null
    form.name = ''
    form.totalAmount = null
    form.months = 12
    form.category = 'Shopping'
    form.startDate = format(new Date(), 'yyyy-MM-dd')
    Object.keys(errors).forEach(k => delete errors[k])
  }
})
</script>

<style lang="scss" scoped>
.ci-context { margin: 0 0 16px; font-size: var(--fs-body); line-height: 20px; }
.ci-wrap { flex-wrap: wrap; overflow: visible; }
.ci-months { display: flex; gap: 8px; align-items: center; }
.ci-months__input { width: 88px; }
.ci-summary { margin-bottom: 16px; .row { cursor: default; min-height: 44px; &:active { background: none; } } }
</style>
