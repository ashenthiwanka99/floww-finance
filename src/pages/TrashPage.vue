<template>
  <q-page>
    <PageHead title="Recently deleted" back>
      <button v-if="trashStore.count" class="btn btn--danger btn--small" @click="confirmClear">Empty</button>
    </PageHead>
    <p class="page-sub num">
      {{ trashStore.count ? `${trashStore.count} ${trashStore.count === 1 ? 'item' : 'items'}, kept for 30 days.` : 'Deleted items stay here for 30 days.' }}
    </p>

    <div v-if="trashStore.count" class="list">
      <div v-for="item in trashStore.recentItems" :key="item.id" class="row trash-row">
        <span class="row__icon material-symbols-outlined">{{ typeIcon(item.type) }}</span>
        <span class="row__main">
          <span class="row__title">{{ item.label }}</span>
          <span class="row__meta">{{ typeLabel(item.type) }} · {{ formatRelative(item.deletedAt) }}</span>
        </span>
        <button class="btn btn--outline btn--small" @click="handleRestore(item)">Restore</button>
        <button class="icon-btn trash-purge" :aria-label="`Delete ${item.label} for good`" @click="handlePurge(item)">
          <span class="material-symbols-outlined">delete_forever</span>
        </button>
      </div>
    </div>
    <p v-else class="empty">Nothing deleted in the last 30 days.</p>
  </q-page>
</template>

<script setup>
import { onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { formatDistanceToNow } from 'date-fns'
import { useTrashStore } from '../stores/trashStore'
import { useFinanceStore } from '../stores/financeStore'
import { useSavingsStore } from '../stores/savingsStore'
import { useBuyListStore } from '../stores/buyListStore'
import { showToast } from '../utils/toast'
import PageHead from '../components/layout/PageHead.vue'

const $q = useQuasar()
const trashStore = useTrashStore()
const financeStore = useFinanceStore()
const savingsStore = useSavingsStore()
const buyListStore = useBuyListStore()

onMounted(() => {
  trashStore.purgeExpired()
})

const icons = { expense: 'receipt_long', loan: 'account_balance', goal: 'savings', buyItem: 'shopping_basket', schedule: 'event_repeat' }
const labels = { expense: 'Expense', loan: 'Loan', goal: 'Goal', buyItem: 'Item', schedule: 'Schedule' }

const typeIcon = type => icons[type] || 'delete'
const typeLabel = type => labels[type] || 'Item'

function formatRelative(timestamp) {
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true })
  } catch {
    return ''
  }
}

function handleRestore(item) {
  try {
    if (item.type === 'expense') {
      const items = item.payload.items || [item.payload]
      items.forEach(e => financeStore.expenses.push(e))
    } else if (item.type === 'loan') {
      financeStore.loans.push(item.payload.loan)
      if (item.payload.expenses) {
        item.payload.expenses.forEach(e => financeStore.expenses.push(e))
      }
    } else if (item.type === 'goal') {
      savingsStore.goals.push(item.payload)
    } else if (item.type === 'buyItem') {
      buyListStore.items.push(item.payload)
    }
    trashStore.removeFromTrash(item.id)
    showToast('Restored', 'edit')
  } catch (err) {
    showToast('Restore failed', 'error')
  }
}

function handlePurge(item) {
  trashStore.removeFromTrash(item.id)
  showToast('Deleted for good', 'delete')
}

function confirmClear() {
  $q.dialog({
    title: 'Empty recently deleted?',
    message: `${trashStore.count} ${trashStore.count === 1 ? 'item is' : 'items are'} deleted for good. This cannot be undone.`,
    cancel: { label: 'Keep', flat: true, color: 'dark' },
    ok: { label: 'Empty', unelevated: true, color: 'negative' }
  }).onOk(() => {
    trashStore.clearAll()
    showToast('Recently deleted emptied', 'delete')
  })
}
</script>

<style lang="scss" scoped>
.trash-row {
  cursor: default;
  padding-right: 4px;
  &:active { background: none; }
}

.trash-purge { color: var(--muted); }
</style>
