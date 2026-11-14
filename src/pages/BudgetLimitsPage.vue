<template>
  <q-page>
    <PageHead title="Spending limits" back />
    <p class="page-sub">A limit per category for each salary cycle. Leave it at 0 for no limit.</p>

    <section class="section">
      <div class="section-head"><h2>Categories</h2></div>
      <div class="list">
        <label v-for="cat in defaultBudgetCats" :key="cat.key" class="row limit-row">
          <span class="row__icon material-symbols-outlined">{{ cat.icon }}</span>
          <span class="row__main">
            <span class="row__title">{{ categoryLabel(cat.key) }}</span>
            <span class="row__meta num" :class="{ 'is-negative': isOver(cat.key, financeStore.budgetLimits[cat.key]) }">{{ spentMeta(cat.key, financeStore.budgetLimits[cat.key]) }}</span>
          </span>
          <span class="money-wrap limit-input">
            <MoneyInput
              :modelValue="financeStore.budgetLimits[cat.key]"
              placeholder="0"
              :aria-label="`${categoryLabel(cat.key)} limit`"
              @update:modelValue="financeStore.budgetLimits[cat.key] = $event"
              @change="saved"
            />
          </span>
        </label>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Your categories</h2>
        <router-link to="/custom-categories">Manage</router-link>
      </div>
      <div v-if="settingsStore.customCategories.length" class="list">
        <label v-for="(cat, i) in settingsStore.customCategories" :key="cat.name || i" class="row limit-row">
          <span class="row__icon material-symbols-outlined">{{ cat.icon || 'label' }}</span>
          <span class="row__main">
            <span class="row__title">{{ cat.name }}</span>
            <span class="row__meta num" :class="{ 'is-negative': isOver(cat.name, cat.budgetLimit) }">{{ spentMeta(cat.name, cat.budgetLimit) }}</span>
          </span>
          <span class="money-wrap limit-input">
            <MoneyInput
              :modelValue="cat.budgetLimit || 0"
              placeholder="0"
              :aria-label="`${cat.name} limit`"
              @update:modelValue="updateCustomLimit(i, $event)"
              @change="saved"
            />
          </span>
        </label>
      </div>
      <p v-else class="empty">Your own categories get a limit here once you add them in Categories.</p>
    </section>
  </q-page>
</template>

<script setup>
import { useFinanceStore } from '../stores/financeStore'
import { useSettingsStore } from '../stores/settingsStore'
import { getCategoryIcon, categoryLabel } from '../utils/categoryConfig'
import { formatMoney } from '../utils/format'
import { showToast } from '../utils/toast'
import PageHead from '../components/layout/PageHead.vue'
import MoneyInput from '../components/shared/MoneyInput.vue'

const financeStore = useFinanceStore()
const settingsStore = useSettingsStore()

const defaultBudgetCats = ['bills', 'groceries', 'dining', 'subscriptions', 'transport', 'fuel', 'personalCare', 'healthcare', 'installments', 'others']
  .map(key => ({ key, icon: getCategoryIcon(key).icon }))

function spentThisCycle(category) {
  return financeStore.currentMonthExpenses
    .filter(e => e.category === category && e.status === 'paid')
    .reduce((s, e) => s + e.amount, 0)
}

function isOver(category, limit) {
  return Number(limit) > 0 && spentThisCycle(category) > Number(limit)
}

function spentMeta(category, limit) {
  const spent = spentThisCycle(category)
  if (!spent) return 'Nothing spent this cycle'
  if (isOver(category, limit)) return `${formatMoney(spent)} spent, ${formatMoney(spent - Number(limit))} over`
  return `${formatMoney(spent)} spent this cycle`
}

function updateCustomLimit(index, value) {
  settingsStore.customCategories[index].budgetLimit = value
}

function saved() {
  showToast('Limit saved')
}
</script>

<style lang="scss" scoped>
.limit-row { cursor: text; }

.limit-input {
  flex: none;
  width: 120px;
  height: 40px;

  :deep(.money-input) {
    text-align: right;
    color: var(--text);
    font-size: 16px;
    font-family: var(--font);
    font-variant-numeric: tabular-nums;
  }
}
</style>
