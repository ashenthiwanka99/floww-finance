<template>
  <BottomSheet
    :model-value="modelValue"
    title="Edit card"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form v-if="card" @submit.prevent="handleSave">
      <label class="field">
        <span class="field-label">Card name</span>
        <input v-model="form.name" class="field-input" :class="{ 'field-error': fieldErrors.name }" @input="clearError('name')" />
        <span v-if="fieldErrors.name" class="field-error-msg">{{ fieldErrors.name }}</span>
      </label>

      <div class="field-row">
        <label class="field">
          <span class="field-label">Bank</span>
          <input v-model="form.issuer" class="field-input" />
        </label>
        <label class="field">
          <span class="field-label">Last 4 digits</span>
          <input v-model="form.last4" class="field-input num" maxlength="4" inputmode="numeric" />
        </label>
      </div>

      <label class="field">
        <span class="field-label">Network</span>
        <select v-model="form.network" class="field-input">
          <option v-for="n in networks" :key="n.value" :value="n.value">{{ n.label }}</option>
        </select>
      </label>

      <div class="field">
        <span class="field-label">Shared limit</span>
        <template v-if="linkedSiblings.length">
          <p class="field-help share-text">Shares its limit with {{ linkedSiblings.map(c => c.name).join(', ') }}. A new limit applies to all of them.</p>
          <button type="button" class="btn btn--outline btn--small" @click="handleUnlink">Stop sharing</button>
        </template>
        <div v-else-if="linkableCards.length" class="chips share-chips">
          <button v-for="c in linkableCards" :key="c.id" type="button" class="chip" @click="handleLink(c.id)">
            Share with {{ c.name }}
          </button>
        </div>
        <p v-else class="field-help share-text">Add another card to share one limit between them.</p>
      </div>

      <div class="field">
        <label class="field-label" for="edit-card-limit">Credit limit</label>
        <div class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.limit }">
          <span class="money-lkr">LKR</span>
          <MoneyInput id="edit-card-limit" v-model="form.limit" class="field-input num" :error="false" @update:modelValue="clearError('limit')" />
        </div>
        <span v-if="fieldErrors.limit" class="field-error-msg">{{ fieldErrors.limit }}</span>
      </div>

      <div class="field-row">
        <label class="field">
          <span class="field-label">Statement day</span>
          <input v-model.number="form.statementDay" type="number" min="1" max="31" class="field-input num" />
        </label>
        <label class="field">
          <span class="field-label">Due day</span>
          <input v-model.number="form.paymentDueDay" type="number" min="1" max="31" class="field-input num" />
        </label>
      </div>

      <div class="field">
        <label class="field-label" for="edit-card-owed">Owed now</label>
        <div class="money-wrap">
          <span class="money-lkr">LKR</span>
          <MoneyInput id="edit-card-owed" v-model="form.currentOutstanding" class="field-input num" :error="false" />
        </div>
        <p class="field-help">Change this only when it differs from your bank statement.</p>
      </div>

      <button type="submit" class="btn btn--primary btn--block">Save changes</button>
      <button type="button" class="btn btn--danger btn--block delete-btn" @click="handleDelete">Delete card</button>
    </form>
  </BottomSheet>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import { useQuasar } from 'quasar'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { showToast } from '../../utils/toast'
import { useCreditCardStore } from '../../stores/creditCardStore'
import { useFinanceStore } from '../../stores/financeStore'

const $q = useQuasar()

function ask(title, message, ok, onOk) {
  $q.dialog({
    title,
    message,
    cancel: { label: 'Keep', flat: true, color: 'dark' },
    ok: { label: ok, unelevated: true, color: 'negative' }
  }).onOk(onOk)
}

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  card: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'deleted'])

const cardStore = useCreditCardStore()
const financeStore = useFinanceStore()

const networks = [
  { value: 'amex', label: 'Amex' },
  { value: 'master', label: 'Mastercard' },
  { value: 'visa', label: 'Visa' },
  { value: 'discover', label: 'Discover' }
]

const form = reactive({
  name: '',
  issuer: '',
  last4: '',
  network: 'amex',
  limit: null,
  statementDay: 25,
  paymentDueDay: 15,
  currentOutstanding: 0,
  color: '#C0C1FF'
})

const fieldErrors = reactive({})

// Other cards in the same credit line (excluding self)
const linkedSiblings = computed(() => {
  if (!props.card?.creditLineId) return []
  return cardStore.activeCards.filter(c =>
    c.id !== props.card.id && c.creditLineId === props.card.creditLineId
  )
})

// Cards we could link to (other independent cards, when this card is independent)
const linkableCards = computed(() => {
  if (!props.card || props.card.creditLineId) return []
  return cardStore.activeCards.filter(c => c.id !== props.card.id && !c.creditLineId)
})

function clearError(key) {
  if (fieldErrors[key]) delete fieldErrors[key]
}

function handleLink(targetId) {
  if (!props.card) return
  const target = cardStore.getCard(targetId)
  if (!target) return
  cardStore.linkCards(props.card.id, targetId)
  // After linking, this card adopts target's limit — sync the form so the
  // user sees the inherited limit reflected.
  form.limit = target.limit
  showToast(`Linked to ${target.name}`, 'success')
}

function handleUnlink() {
  if (!props.card?.creditLineId) return
  ask('Stop sharing this limit?', 'Each card will then track its own limit.', 'Stop sharing', () => {
    cardStore.unlinkCard(props.card.id)
    showToast('Card unlinked', 'edit')
  })
}

function handleSave() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!props.card) return

  if (!form.name.trim()) { fieldErrors.name = 'Card name is required'; return }
  if (!form.limit || form.limit <= 0) { fieldErrors.limit = 'Limit must be greater than 0'; return }

  // The integrity check recomputes outstanding from the ledger (charges − payments)
  // on every boot. To make a manual "adjust to match my statement" correction
  // stick, store the difference as outstandingAdjustment, which that recompute honors.
  const desiredOutstanding = Math.max(0, Number(form.currentOutstanding) || 0)
  const charges = financeStore.expenses
    .filter(e => e.paidByCardId === props.card.id && e.status === 'paid')
    .reduce((s, e) => s + (e.amount || 0), 0)
  const payments = financeStore.expenses
    .filter(e => e.category === 'creditCardPayment' && e.cardId === props.card.id && e.status === 'paid')
    .reduce((s, e) => s + (e.amount || 0), 0)
  const outstandingAdjustment = Math.round((desiredOutstanding - (charges - payments)) * 100) / 100

  const result = cardStore.updateCard(props.card.id, {
    name: form.name.trim(),
    issuer: form.issuer.trim(),
    last4: form.last4.trim(),
    network: form.network,
    limit: Number(form.limit),
    statementDay: Math.max(1, Math.min(31, Number(form.statementDay) || 25)),
    paymentDueDay: Math.max(1, Math.min(31, Number(form.paymentDueDay) || 15)),
    currentOutstanding: desiredOutstanding,
    outstandingAdjustment,
    color: form.color
  })

  if (result.success) {
    showToast('Card updated', 'edit')
    emit('update:modelValue', false)
  } else {
    showToast(result.errors?.[0] || 'Failed to update', 'error')
  }
}

function handleDelete() {
  if (!props.card) return
  const card = props.card
  ask(`Delete ${card.name}?`, 'Past charges stay in your spending. Only the card is removed.', 'Delete', () => {
    cardStore.deleteCard(card.id)
    showToast('Card deleted', 'delete')
    emit('deleted', card.id)
    emit('update:modelValue', false)
  })
}

watch(() => props.modelValue, (val) => {
  if (val && props.card) {
    form.name = props.card.name || ''
    form.issuer = props.card.issuer || ''
    form.last4 = props.card.last4 || ''
    form.network = props.card.network || 'amex'
    form.limit = props.card.limit || null
    form.statementDay = props.card.statementDay || 25
    form.paymentDueDay = props.card.paymentDueDay || 15
    form.currentOutstanding = props.card.currentOutstanding || 0
    form.color = props.card.color || '#C0C1FF'
    Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  }
})
</script>

<style lang="scss" scoped>
.share-text { margin: 0 0 8px; }
.share-chips { flex-wrap: wrap; }
.delete-btn { margin-top: 8px; }
</style>
