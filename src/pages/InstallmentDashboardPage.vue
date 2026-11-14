<template>
  <q-page>
    <q-pull-to-refresh @refresh="onRefresh" color="dark">
      <PageHead title="Installments" back>
        <button class="btn btn--primary btn--small" @click="openExpenseSheet({ category: 'installments' })">
          <span class="material-symbols-outlined">add</span>Add plan
        </button>
      </PageHead>

      <template v-if="plans.length">
        <div class="kpis">
          <div>
            <p class="figure-label">Each month</p>
            <p class="figure num" :class="{ 'is-zero': !monthlyBurden }">{{ formatMoney(monthlyBurden) }}</p>
          </div>
          <div>
            <p class="figure-label">Still to pay</p>
            <p class="figure num" :class="{ 'is-zero': !totalOutstanding }">{{ formatMoney(totalOutstanding) }}</p>
          </div>
        </div>

        <section class="section">
          <div class="section-head"><h2>Active <span class="num head-count">{{ activePlans.length }}</span></h2></div>
          <div v-if="activePlans.length" class="list">
            <div v-for="plan in activePlans" :key="plan.groupId" class="row plan-row" role="button" tabindex="0" @click="openPlan(plan)" @keydown.enter="openPlan(plan)">
              <span class="row__main">
                <span class="plan-row__line">
                  <span class="row__title">{{ plan.planName }}</span>
                  <span class="row__amount num">{{ formatMoney(plan.remaining) }}</span>
                </span>
                <span class="track plan-row__track" role="img" :aria-label="`${plan.paidCount} of ${plan.totalInstallments} paid`">
                  <span class="fill--hue" :style="{ width: `${plan.progressPct}%` }" />
                </span>
                <span class="plan-row__line">
                  <span class="row__meta num">
                    {{ plan.paidCount }} of {{ plan.totalInstallments }} paid · {{ formatMoney(plan.monthlyAmount) }} a month<template v-if="plan.nextDueFormatted"> · next {{ plan.nextDueFormatted }}</template>
                  </span>
                  <span v-if="plan.overdueCount" class="pill pill--negative">{{ plan.overdueCount }} overdue</span>
                </span>
                <button v-if="plan.pendingCount > 0" class="btn btn--outline btn--small plan-row__payoff" @click.stop="openPayoff(plan)">
                  Pay off early
                </button>
              </span>
            </div>
          </div>
          <p v-else class="empty">Every plan is paid off.</p>
        </section>

        <section v-if="completedPlans.length" class="section">
          <button type="button" class="section-head done-toggle" :aria-expanded="showCompleted" @click="showCompleted = !showCompleted">
            <h2>Paid off <span class="num done-count">{{ completedPlans.length }}</span></h2>
            <span class="material-symbols-outlined">{{ showCompleted ? 'expand_less' : 'expand_more' }}</span>
          </button>
          <div v-if="showCompleted" class="list">
            <div v-for="plan in completedPlans" :key="plan.groupId" class="row plan-row">
              <span class="row__main">
                <span class="row__title">{{ plan.planName }}</span>
                <span class="row__meta num">{{ plan.totalInstallments }} payments</span>
              </span>
              <span class="row__end row__amount num">{{ formatMoney(plan.totalCost) }}</span>
            </div>
          </div>
        </section>
      </template>

      <div v-else class="empty">
        <p class="empty__title">No installment plans</p>
        <p class="empty__subtitle">Add an expense in the Installments category and its monthly payments show up here.</p>
      </div>
    </q-pull-to-refresh>

    <BottomSheet :model-value="!!payoffPlan" title="Pay off early" @update:model-value="v => { if (!v) payoffPlan = null }">
      <template v-if="payoffPlan">
        <p class="field-help payoff-context num">
          {{ payoffPlan.planName }}: {{ payoffPlan.pendingCount }} payments left, LKR {{ formatMoney(payoffPlan.pendingCount * payoffPlan.monthlyAmount) }}.
        </p>
        <div class="field">
          <span class="field-label">How many to pay now</span>
          <div class="stepper">
            <button class="btn btn--outline" aria-label="One fewer" :disabled="payoffCount <= 1" @click="payoffCount--">
              <span class="material-symbols-outlined">remove</span>
            </button>
            <span class="figure num stepper__value">{{ payoffCount }}</span>
            <button class="btn btn--outline" aria-label="One more" :disabled="payoffCount >= payoffPlan.pendingCount" @click="payoffCount++">
              <span class="material-symbols-outlined">add</span>
            </button>
          </div>
        </div>
        <p class="group-label num payoff-total"><span>Paid now</span><span>LKR {{ formatMoney(payoffCount * payoffPlan.monthlyAmount) }}</span></p>
        <div class="btn-row">
          <button class="btn btn--outline" @click="payoffPlan = null">Cancel</button>
          <button class="btn btn--primary" @click="confirmPayoff">Pay {{ payoffCount }}</button>
        </div>
      </template>
    </BottomSheet>
    <EditExpenseSheet v-model="showEdit" :expense="editing" />
  </q-page>
</template>

<script setup>
import { ref, inject } from 'vue'
import { useInstallmentDashboard } from '../composables/useInstallmentDashboard'
import { useCloudSync } from '../composables/useCloudSync'
import { useFinanceStore } from '../stores/financeStore'
import { formatMoney } from '../utils/format'
import { showToast } from '../utils/toast'
import PageHead from '../components/layout/PageHead.vue'
import BottomSheet from '../components/shared/BottomSheet.vue'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'

const showEdit = ref(false)
const editing = ref(null)
function openPlan(plan) {
  const rows = financeStore.expenses.filter(e => e.installmentGroupId === plan.groupId)
  const next = rows.filter(e => e.status !== 'paid').sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))[0]
  const last = rows.sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))[0]
  editing.value = next || last || null
  if (editing.value) showEdit.value = true
}

const { plans, activePlans, completedPlans, totalOutstanding, monthlyBurden } = useInstallmentDashboard()

const financeStore = useFinanceStore()
const { downloadFromCloud, syncNow } = useCloudSync()
const openExpenseSheet = inject('openExpenseSheet', () => {})
const showCompleted = ref(false)

const payoffPlan = ref(null)
const payoffCount = ref(1)

function openPayoff(plan) {
  if (!plan || plan.pendingCount < 1) return
  payoffPlan.value = plan
  payoffCount.value = Math.max(1, plan.pendingCount)
}

function confirmPayoff() {
  if (!payoffPlan.value) return
  const result = financeStore.payOffInstallments(
    payoffPlan.value.groupId,
    payoffCount.value,
    financeStore.currentMonth
  )
  if (result.success) {
    showToast(`${result.paidCount} installment${result.paidCount > 1 ? 's' : ''} paid off early`)
    syncNow()
  }
  payoffPlan.value = null
}

async function onRefresh(done) {
  try { await downloadFromCloud() } catch {}
  done()
}
</script>

<style lang="scss" scoped>
.plan-row { cursor: default; padding-top: 12px; padding-bottom: 12px; &:active { background: none; } }
.head-count { color: var(--muted); font-weight: 400; margin-left: 4px; }
.plan-row__line { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.plan-row__track { margin: 8px 0 6px; height: 6px; }
.plan-row__payoff { margin-top: 10px; }

.done-toggle {
  width: 100%;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: var(--text);
  .material-symbols-outlined { color: var(--muted); }
}
.done-count { color: var(--muted); font-weight: 400; margin-left: 4px; }

.payoff-context { margin: 0 0 16px; font-size: var(--fs-body); line-height: 20px; }
.stepper { display: flex; align-items: center; gap: 16px; }
.stepper__value { min-width: 32px; text-align: center; }
.payoff-total { padding-top: 0; }
</style>
