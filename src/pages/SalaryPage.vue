<template>
  <q-page>
    <PageHead title="Salary and cycles" back />
    <p class="page-sub">Each salary starts a new budget cycle on the day it lands. Spending counts against that cycle until the next salary.</p>

    <button type="button" class="btn btn--primary btn--block" :disabled="!accounts.active.length" @click="recordSalary">Salary arrived</button>
    <p v-if="!accounts.active.length" class="field-help">Set up your wallets first, so the salary goes into your NTB dollar account.</p>

    <section class="section">
      <div class="section-head"><h2>Cycles</h2></div>
      <div v-if="cycles.length" class="list">
        <button v-for="c in cycles" :key="c.month" type="button" class="row" @click="open(c)">
          <span class="row__icon material-symbols-outlined">work</span>
          <span class="row__main">
            <span class="row__title">{{ c.title }}</span>
            <span class="row__meta num">{{ c.meta }}</span>
          </span>
          <span class="row__end row__amount num" :class="{ 'is-zero': !c.amount }">{{ c.amountText }}</span>
        </button>
      </div>
      <p v-else class="empty">No salary recorded yet. Tap Salary arrived when it lands.</p>
    </section>

    <IncomeSheet v-model="showIncome" :income="editingIncome" :prefill="{ kind: 'salary' }" />

    <BottomSheet v-model="showLegacy" :title="legacy ? `${legacy.title} cycle` : 'Cycle'">
      <form v-if="legacy" novalidate @submit.prevent="saveLegacy">
        <label class="field">
          <span class="field-label">Day the salary landed</span>
          <input v-model="legacyDate" type="date" class="field-input num" />
          <span class="field-help">Moving this date moves where the {{ legacy.title }} cycle starts.</span>
        </label>
        <div class="field">
          <span class="field-label">Salary in USD</span>
          <div class="money-wrap">
            <span class="money-lkr">$</span>
            <MoneyInput v-model="legacyUsd" decimal placeholder="0" />
          </div>
        </div>
        <button type="submit" class="btn btn--primary btn--block">Save</button>
      </form>
    </BottomSheet>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format, parseISO, isValid } from 'date-fns'
import PageHead from '../components/layout/PageHead.vue'
import BottomSheet from '../components/shared/BottomSheet.vue'
import MoneyInput from '../components/shared/MoneyInput.vue'
import IncomeSheet from '../components/accounts/IncomeSheet.vue'
import { useAccountsStore } from '../stores/accountsStore'
import { useFinanceStore } from '../stores/financeStore'
import { getCycleWindow } from '../utils/format'
import { money } from '../utils/wallets'
import { showToast } from '../utils/toast'

const accounts = useAccountsStore()
const finance = useFinanceStore()

const monthTitle = key => {
  const [y, m] = key.split('-').map(Number)
  return format(new Date(y, m - 1), 'MMMM yyyy')
}

const cycles = computed(() => {
  const list = []
  for (const [month, mi] of Object.entries(finance.monthlyIncomes || {})) {
    if (!mi) continue
    const income = mi.incomeId ? accounts.incomes.find(i => i.id === mi.incomeId) : null
    const w = getCycleWindow(month)
    const range = w?.start
      ? (w.end ? `${format(parseISO(w.start), 'd MMM')} to ${format(parseISO(w.end), 'd MMM')}` : `From ${format(parseISO(w.start), 'd MMM')}`)
      : 'No salary date'
    const account = income ? accounts.getAccount(income.accountId) : null
    const amount = income ? income.amount : Number(mi.usdAmount) || 0
    const currency = income ? income.currency : 'USD'
    list.push({
      month,
      title: monthTitle(month),
      meta: [range, account?.name].filter(Boolean).join(' · '),
      amount,
      amountText: amount ? money(amount, currency) : 'No amount',
      income,
      mi
    })
  }
  return list.sort((a, b) => b.month.localeCompare(a.month))
})

const showIncome = ref(false)
const editingIncome = ref(null)

function recordSalary() {
  editingIncome.value = null
  showIncome.value = true
}

const showLegacy = ref(false)
const legacy = ref(null)
const legacyDate = ref('')
const legacyUsd = ref(null)

function open(c) {
  if (c.income) {
    editingIncome.value = c.income
    showIncome.value = true
    return
  }
  legacy.value = c
  legacyDate.value = c.mi.receivedDate || ''
  legacyUsd.value = Number(c.mi.usdAmount) || null
  showLegacy.value = true
}

function saveLegacy() {
  const d = legacyDate.value ? parseISO(legacyDate.value) : null
  if (!d || !isValid(d)) { showToast('Pick the day you were paid', 'error'); return }
  const mi = legacy.value.mi
  finance.setMonthlyIncome(legacy.value.month, {
    ...mi,
    usdAmount: Number(legacyUsd.value) || 0,
    receivedDate: legacyDate.value,
    salaryReceivedMonth: legacyDate.value.slice(0, 7),
    date: Date.now()
  })
  finance.syncBudgetMonth()
  showLegacy.value = false
  showToast('Cycle saved')
}
</script>
