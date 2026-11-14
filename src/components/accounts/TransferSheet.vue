<template>
  <BottomSheet :model-value="modelValue" :title="record ? 'Edit move' : 'Move money'" @update:model-value="close">
    <form novalidate @submit.prevent="save">
      <TransferFields :form="form" :errors="errors" uid="move-sheet" />
      <p v-if="errors.form" class="field-error-msg">{{ errors.form }}</p>
      <div class="btn-stack">
        <button type="submit" class="btn btn--primary btn--block" :disabled="saving">{{ record ? 'Save changes' : 'Save move' }}</button>
        <button v-if="record" type="button" class="btn btn--danger btn--block" @click="remove">Delete</button>
      </div>
    </form>
  </BottomSheet>
</template>

<script setup>
import { reactive, ref, watch } from 'vue'
import BottomSheet from '../shared/BottomSheet.vue'
import TransferFields from './TransferFields.vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { useMoneyRecords, blankMove } from '../../composables/useMoneyRecords'
import { useExpenseActions } from '../../composables/useExpenseActions'
import { useCloudSync } from '../../composables/useCloudSync'
import { showToast } from '../../utils/toast'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  record: { type: Object, default: null },
  prefill: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const accounts = useAccountsStore()
const { saveMove } = useMoneyRecords()
const { deleteTransfer, deleteExpense } = useExpenseActions()
const { syncNow } = useCloudSync()

const form = reactive(blankMove(accounts))
const errors = ref({})
const saving = ref(false)

watch(() => props.modelValue, open => {
  if (!open) return
  errors.value = {}
  const r = props.record
  if (r?.kind === 'transfer') {
    const t = r.item
    const ends = accounts.transferEnds(t)
    const from = accounts.getAccount(ends.from)
    const to = accounts.getAccount(ends.to)
    Object.assign(form, {
      preset: null,
      from: from ? `acct:${from.id}` : '',
      to: to ? `acct:${to.id}` : '',
      amount: ends.sent,
      toAmount: from && to && from.currency !== to.currency ? ends.received : null,
      date: t.date,
      note: t.note || ''
    })
  } else if (r?.kind === 'expense') {
    const e = r.item
    Object.assign(form, {
      preset: 'card',
      from: e.accountId ? `acct:${e.accountId}` : '',
      to: e.cardId ? `card:${e.cardId}` : '',
      amount: typeof e.usdAmount === 'number' ? e.usdAmount : e.amount,
      toAmount: typeof e.usdAmount === 'number' ? e.amount : null,
      date: e.dueDate,
      note: e.notes || ''
    })
  } else {
    Object.assign(form, blankMove(accounts, props.prefill?.preset || 'exchange'))
    if (props.prefill?.from) form.from = props.prefill.from
    if (props.prefill?.to) form.to = props.prefill.to
    if (props.prefill?.amount) form.amount = props.prefill.amount
  }
})

function close() {
  emit('update:modelValue', false)
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    const res = await saveMove(form, props.record)
    if (res?.success === false) {
      errors.value = Array.isArray(res.errors) ? { form: res.errors[0] } : (res.errors || { form: 'Could not save that' })
      return
    }
    showToast(props.record ? 'Saved' : 'Move saved', 'paid')
    syncNow()
    emit('saved')
    close()
  } finally {
    saving.value = false
  }
}

function remove() {
  if (props.record?.kind === 'transfer') deleteTransfer(props.record.item.id)
  else if (props.record?.kind === 'expense') deleteExpense(props.record.item.id)
  syncNow()
  close()
}
</script>
