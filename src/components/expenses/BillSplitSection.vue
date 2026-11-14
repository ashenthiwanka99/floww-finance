<template>
  <div class="split">
    <div class="field">
      <label class="field-label" for="split-person">Split with</label>
      <input
        id="split-person"
        v-model="splitPerson"
        type="text"
        class="field-input"
        placeholder="Name"
        @input="$emit('update:person', splitPerson)"
      />
      <div v-if="suggestions.length" class="smart-chips split__names">
        <button v-for="s in suggestions" :key="s" type="button" class="chip" @click="selectPerson(s)">{{ s }}</button>
      </div>
    </div>

    <div class="seg seg--block split__type" role="group" aria-label="How to split">
      <button type="button" :aria-pressed="splitType === 'equal'" @click="splitType = 'equal'; recalc()">Half each</button>
      <button type="button" :aria-pressed="splitType === 'custom'" @click="splitType = 'custom'">Custom</button>
    </div>

    <div v-if="splitType === 'custom'" class="field">
      <label class="field-label">Their share</label>
      <div class="money-wrap">
        <span class="money-lkr">LKR</span>
        <MoneyInput v-model="customShare" placeholder="0" @update:model-value="onCustomChange" />
      </div>
    </div>

    <dl v-if="totalAmount > 0" class="split__sum num">
      <div><dt>You pay</dt><dd>{{ formatMoney(yourShare) }}</dd></div>
      <div><dt>{{ splitPerson || 'They' }} owe{{ splitPerson ? 's' : '' }} you</dt><dd>{{ formatMoney(theirShare) }}</dd></div>
    </dl>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import MoneyInput from '../shared/MoneyInput.vue'
import { formatMoney } from '../../utils/format'
import { useSettingsStore } from '../../stores/settingsStore'

const props = defineProps({
  totalAmount: { type: Number, default: 0 },
  person: { type: String, default: '' }
})

const emit = defineEmits(['update:person', 'update:yourShare', 'update:theirShare'])

const settingsStore = useSettingsStore()
const splitPerson = ref(props.person)
const splitType = ref('equal')
const customShare = ref(null)

const suggestions = computed(() => {
  const saved = settingsStore.savedSplitPeople || []
  const q = splitPerson.value?.toLowerCase()
  if (!q) return saved.slice(0, 4)
  return saved.filter(n => n.toLowerCase().includes(q)).slice(0, 4)
})

const theirShare = computed(() => {
  if (splitType.value === 'custom' && customShare.value > 0) {
    return Math.min(customShare.value, props.totalAmount)
  }
  return Math.round(props.totalAmount / 2)
})

const yourShare = computed(() => Math.max(0, props.totalAmount - theirShare.value))

function selectPerson(name) {
  splitPerson.value = name
  emit('update:person', name)
}

function recalc() {
  customShare.value = null
}

function onCustomChange() {
  // Custom share updated
}

// Emit shares whenever they change
watch([yourShare, theirShare], () => {
  emit('update:yourShare', yourShare.value)
  emit('update:theirShare', theirShare.value)
}, { immediate: true })

watch(splitPerson, (val) => {
  emit('update:person', val)
})
</script>

<style lang="scss" scoped>
.split__names { margin-top: 8px; }
.split__type { margin-bottom: 16px; }

.split__sum {
  margin: 0;
  border-top: 1px solid var(--rule);

  > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--rule);
  }
  dt { color: var(--muted); }
  dd { margin: 0; font-weight: 500; }
}
</style>
