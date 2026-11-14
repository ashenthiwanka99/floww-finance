<template>
  <BottomSheet
    :model-value="modelValue"
    title="Add a credit card"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <form @submit.prevent="handleSave">
      <label class="field">
        <span class="field-label">Card name</span>
        <input
          v-model="form.name"
          class="field-input"
          :class="{ 'field-error': fieldErrors.name }"
          placeholder="HNB Visa Platinum"
          @input="clearError('name')"
        />
        <span v-if="fieldErrors.name" class="field-error-msg">{{ fieldErrors.name }}</span>
      </label>

      <div class="field">
        <label class="field-label" for="card-issuer">Bank</label>
        <input id="card-issuer" v-model="form.issuer" class="field-input" placeholder="HNB" />
        <div class="chips card-chips">
          <button
            v-for="s in issuerSuggestions"
            :key="s"
            type="button"
            class="chip"
            :class="{ on: form.issuer === s }"
            @click="form.issuer = s"
          >{{ s }}</button>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <span class="field-label">Network</span>
          <select v-model="form.network" class="field-input" aria-label="Network">
            <option v-for="n in networks" :key="n.value" :value="n.value">{{ n.label }}</option>
          </select>
        </div>
        <label class="field">
          <span class="field-label">Last 4 digits</span>
          <input v-model="form.last4" class="field-input num" maxlength="4" inputmode="numeric" placeholder="4821" />
        </label>
      </div>

      <div v-if="shareableCards.length" class="field">
        <span class="field-label">Credit limit</span>
        <div class="chips share-chips" role="group" aria-label="Credit limit">
          <button type="button" class="chip" :class="{ on: !form.shareWithCardId }" @click="form.shareWithCardId = null">Its own limit</button>
          <button
            v-for="c in shareableCards"
            :key="c.id"
            type="button"
            class="chip"
            :class="{ on: form.shareWithCardId === c.id }"
            @click="form.shareWithCardId = c.id"
          >Shared with {{ c.name }}</button>
        </div>
        <p v-if="form.shareWithCardId" class="field-help">Both cards draw from one limit, so a charge on either lowers what is available on both.</p>
      </div>

      <div class="field">
        <label v-if="!shareableCards.length" class="field-label" for="card-limit">Credit limit</label>
        <div v-if="!form.shareWithCardId" class="money-wrap" :class="{ 'money-wrap--error': !!fieldErrors.limit }">
          <span class="money-lkr">LKR</span>
          <MoneyInput
            id="card-limit"
            v-model="form.limit"
            class="field-input num"
            placeholder="300,000"
            :error="false"
            @update:modelValue="clearError('limit')"
          />
        </div>
        <p v-else class="field-help num">Uses the shared limit of LKR {{ inheritedLimitDisplay }}.</p>
        <span v-if="fieldErrors.limit" class="field-error-msg">{{ fieldErrors.limit }}</span>
      </div>

      <div class="field-row">
        <label class="field">
          <span class="field-label">Statement day</span>
          <input v-model.number="form.statementDay" type="number" min="1" max="31" class="field-input num" />
          <span class="field-help">The bill closes</span>
        </label>
        <label class="field">
          <span class="field-label">Due day</span>
          <input v-model.number="form.paymentDueDay" type="number" min="1" max="31" class="field-input num" />
          <span class="field-help">Pay by this day</span>
        </label>
      </div>

      <button type="submit" class="btn btn--primary btn--block">Save card</button>
    </form>
  </BottomSheet>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import BottomSheet from '../shared/BottomSheet.vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { showToast } from '../../utils/toast'
import { useCreditCardStore } from '../../stores/creditCardStore'
import { formatMoney } from '../../utils/format'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'created'])

const cardStore = useCreditCardStore()

const networks = [
  { value: 'amex', label: 'Amex' },
  { value: 'master', label: 'Mastercard' },
  { value: 'visa', label: 'Visa' },
  { value: 'discover', label: 'Discover' }
]

const issuerSuggestions = ['HSBC', 'ComBank', 'Sampath', 'NDB', 'BOC', 'NTB']


const form = reactive({
  name: '',
  issuer: '',
  last4: '',
  network: 'amex',
  limit: null,
  statementDay: 25,
  paymentDueDay: 15,
  color: '#C0C1FF',
  shareWithCardId: null
})

const shareableCards = computed(() =>
  cardStore.activeCards.filter(c => c.limit > 0)
)

const inheritedLimitDisplay = computed(() => {
  const target = cardStore.getCard(form.shareWithCardId)
  return target ? formatMoney(target.limit) : ''
})

const fieldErrors = reactive({})

function clearError(key) {
  if (fieldErrors[key]) delete fieldErrors[key]
}

function handleSave() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])

  if (!form.name.trim()) {
    fieldErrors.name = 'Card name is required'
    return
  }
  // Limit only matters when the card is on its own credit line
  if (!form.shareWithCardId && (!form.limit || form.limit <= 0)) {
    fieldErrors.limit = 'Limit must be greater than 0'
    return
  }

  const result = cardStore.addCard({
    name: form.name,
    issuer: form.issuer,
    network: form.network,
    last4: form.last4,
    limit: form.limit,
    statementDay: form.statementDay,
    paymentDueDay: form.paymentDueDay,
    color: form.color,
    shareWithCardId: form.shareWithCardId
  })

  if (result.success) {
    showToast(`Added ${form.name.trim()}`, 'success')
    emit('created', result.id)
    emit('update:modelValue', false)
  } else {
    showToast(result.errors?.[0] || 'Failed to add card', 'error')
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    form.name = ''
    form.issuer = ''
    form.last4 = ''
    form.network = 'amex'
    form.limit = null
    form.statementDay = 25
    form.paymentDueDay = 15
    form.color = '#C0C1FF'
    form.shareWithCardId = null
    Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  }
})
</script>

<style lang="scss" scoped>
.card-chips { margin-top: 8px; }
.share-chips { flex-wrap: wrap; overflow: visible; margin-bottom: 8px; }
</style>
