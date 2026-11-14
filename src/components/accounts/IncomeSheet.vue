<template>
  <BottomSheet :model-value="modelValue" :title="title" @update:model-value="close">
    <form novalidate @submit.prevent="save">
      <IncomeFields :form="form" :errors="errors" :cycle-month="cycleMonth" uid="income-sheet" />
      <p v-if="errors.form" class="field-error-msg">{{ errors.form }}</p>
      <div class="btn-stack">
        <button type="submit" class="btn btn--primary btn--block">{{ income ? 'Save changes' : 'Save' }}</button>
        <button v-if="income" type="button" class="btn btn--danger btn--block" @click="remove">Delete</button>
      </div>
    </form>
  </BottomSheet>
</template>

<script setup>
import { reactive, ref, computed, watch } from 'vue'
import BottomSheet from '../shared/BottomSheet.vue'
import IncomeFields from './IncomeFields.vue'
import { useAccountsStore } from '../../stores/accountsStore'
import { useMoneyRecords, blankIncome } from '../../composables/useMoneyRecords'
import { useExpenseActions } from '../../composables/useExpenseActions'
import { useCloudSync } from '../../composables/useCloudSync'
import { showToast } from '../../utils/toast'
import { money } from '../../utils/wallets'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  income: { type: Object, default: null },
  prefill: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'saved'])

const accounts = useAccountsStore()
const { saveIncome } = useMoneyRecords()
const { deleteIncome } = useExpenseActions()
const { syncNow } = useCloudSync()

const form = reactive(blankIncome(accounts))
const errors = ref({})

const title = computed(() => {
  if (props.income) return props.income.kind === 'salary' ? 'Edit salary' : 'Edit money in'
  return form.kind === 'salary' ? 'Salary arrived' : 'Money in'
})

const cycleMonth = computed(() =>
  props.income?.kind === 'salary' && form.kind === 'salary' ? (props.income.cycleMonth ?? null) : undefined
)

watch(() => props.modelValue, open => {
  if (!open) return
  errors.value = {}
  const i = props.income
  if (i) {
    Object.assign(form, { kind: i.kind, account: `acct:${i.accountId}`, amount: i.amount, name: i.kind === 'other' ? i.name : '', date: i.date, note: i.note || '' })
  } else {
    Object.assign(form, blankIncome(accounts, props.prefill?.kind || 'other'))
    if (props.prefill?.account) form.account = props.prefill.account
    if (props.prefill?.amount) form.amount = props.prefill.amount
    if (props.prefill?.name) form.name = props.prefill.name
  }
})

function close() {
  emit('update:modelValue', false)
}

function save() {
  const res = saveIncome(form, props.income?.id || null)
  if (!res.success) { errors.value = res.errors || {}; return }
  const a = accounts.getAccount(form.account.replace(/^acct:/, ''))
  showToast(props.income ? 'Saved' : `${money(form.amount, a?.currency)} added to ${a?.name || 'the account'}`, 'paid')
  syncNow()
  emit('saved')
  close()
}

function remove() {
  deleteIncome(props.income.id)
  syncNow()
  close()
}
</script>
