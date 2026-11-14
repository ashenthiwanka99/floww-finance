<template>
  <BottomSheet
    :model-value="modelValue"
    title="Filter"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <p class="field-label">Status</p>
    <div class="seg seg--block filter-row" role="group" aria-label="Status">
      <button
        v-for="s in statusOptions"
        :key="s.value"
        type="button"
        :aria-pressed="localStatus === s.value"
        @click="localStatus = s.value"
      >{{ s.label }}</button>
    </div>

    <p class="field-label">{{ accounts.active.length ? 'Account or card' : 'Paid from' }}</p>
    <div class="chips filter-wrap filter-row">
      <button
        v-for="p in [...paymentOptions, ...cardPills]"
        :key="p.value"
        type="button"
        class="chip"
        :class="{ on: localPayment === p.value }"
        @click="localPayment = p.value"
      >{{ p.name || p.label }}<span v-if="p.last4" class="num"> ••{{ p.last4 }}</span></button>
    </div>

    <p class="field-label">Category</p>
    <div class="chips filter-wrap filter-row">
      <button type="button" class="chip" :class="{ on: !localCategory }" @click="localCategory = null">Any</button>
      <button
        v-for="cat in categoryList"
        :key="cat"
        type="button"
        class="chip"
        :class="{ on: localCategory === cat }"
        @click="localCategory = cat"
      >{{ categoryLabel(cat) }}</button>
    </div>

    <div class="btn-row">
      <button type="button" class="btn btn--outline" :disabled="!hasAnyFilter" @click="clearAll">Clear</button>
      <button type="button" class="btn btn--primary" @click="applyFilters">Show results</button>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import BottomSheet from '../shared/BottomSheet.vue'
import { useFinanceStore } from '../../stores/financeStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCreditCardStore } from '../../stores/creditCardStore'
import { useAccountsStore } from '../../stores/accountsStore'
import { defaultCategories, categoryLabel } from '../../utils/categoryConfig'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  statusFilter: { type: String, default: 'all' },
  paymentFilter: { type: String, default: 'any' },
  categoryFilter: { type: String, default: null }
})

const emit = defineEmits(['update:modelValue', 'apply'])

const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()
const cardStore = useCreditCardStore()
const accounts = useAccountsStore()

const localStatus = ref(props.statusFilter)
const localPayment = ref(props.paymentFilter)
const localCategory = ref(props.categoryFilter)

// Reset local state when sheet opens
watch(() => props.modelValue, (open) => {
  if (open) {
    localStatus.value = props.statusFilter
    localPayment.value = props.paymentFilter
    localCategory.value = props.categoryFilter
  }
})

const customCategories = computed(() => settingsStore.customCategories || [])

const statusOptions = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Paid', dot: true },
  { value: 'pending', label: 'Unpaid', dot: true }
]

const paymentOptions = computed(() => {
  if (!accounts.active.length) {
    return [
      { value: 'any', label: 'Any' },
      { value: 'cash', label: 'Cash', icon: 'payments' },
      { value: 'bank', label: 'Bank', icon: 'account_balance' }
    ]
  }
  return [{ value: 'any', label: 'Any' }, ...['lkr', 'cash', 'usd'].flatMap(w => accounts.accountsIn(w)).map(a => ({ value: `acct:${a.id}`, label: a.name }))]
})

// One pill per active card, value is `card:<uuid>` so the existing single-
// select payment filter stays mutually exclusive (you can't pick "bank" AND
// a specific card — that doesn't model reality).
const cardPills = computed(() =>
  (cardStore.activeCards || []).map(c => ({
    value: `card:${c.id}`,
    name: c.name,
    last4: c.last4,
    color: c.color || '#C0C1FF'
  }))
)

// Sorted category list — by usage frequency
const categoryList = computed(() => {
  const custom = (settingsStore.customCategories || []).map(c => c.name || c)
  const freq = {}
  financeStore.expenses.forEach(e => {
    if (e.category) freq[e.category] = (freq[e.category] || 0) + 1
  })
  const all = [...new Set([...defaultCategories, ...custom])]
  return all.sort((a, b) => {
    const diff = (freq[b] || 0) - (freq[a] || 0)
    if (diff !== 0) return diff
    return a.localeCompare(b)
  })
})

const hasAnyFilter = computed(() =>
  localStatus.value !== 'all' || localPayment.value !== 'any' || !!localCategory.value
)

function clearAll() {
  localStatus.value = 'all'
  localPayment.value = 'any'
  localCategory.value = null
}

function applyFilters() {
  emit('apply', {
    status: localStatus.value,
    payment: localPayment.value,
    category: localCategory.value
  })
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
.filter-row { margin-bottom: 20px; }
.filter-wrap { flex-wrap: wrap; overflow: visible; }
</style>
