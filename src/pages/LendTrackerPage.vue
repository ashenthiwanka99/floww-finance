<template>
  <q-page>
    <PageHead title="Friends" back />

    <p v-if="allLends.length === 0" class="empty">
      Nobody owes you anything. Add an expense in the Lent category and it shows up here until it is paid back.
    </p>

    <template v-else>
      <section class="panel panel--pad" aria-labelledby="owed-label">
        <p id="owed-label" class="figure-label">Friends owe you</p>
        <p class="figure figure--lead" :class="{ 'is-zero': !totalOutstanding }"><span class="unit">LKR</span>{{ formatMoney(totalOutstanding) }}</p>
        <dl v-if="pendingByPerson.length > 1" class="lend-people num">
          <div v-for="row in pendingByPerson" :key="row.name">
            <dt>{{ row.name }} <span>· {{ row.count }} {{ row.count === 1 ? 'loan' : 'loans' }}</span></dt>
            <dd>{{ formatMoney(row.total) }}</dd>
          </div>
        </dl>
      </section>

      <section class="section">
        <div class="section-head"><h2>Waiting to collect</h2></div>
        <div v-if="pending.length" class="list">
          <div v-for="lend in pending" :key="lend.id" class="row" role="button" tabindex="0" @click="openLend(lend)" @keydown.enter="openLend(lend)">
            <PersonAvatar :name="lend.lentTo || lend.name" />
            <span class="row__main">
              <span class="row__title">{{ lend.lentTo || lend.name }}</span>
              <span class="row__meta num">
                Lent {{ formatDate(lend.dueDate) }}<template v-if="lend.collectionDate"> · ask on {{ formatDate(lend.collectionDate) }}</template>
              </span>
            </span>
            <span class="row__end row__amount num">{{ formatMoney(lend.amount) }}</span>
            <button class="btn btn--outline btn--small" @click.stop="markCollected(lend.id)">Mark collected</button>
          </div>
        </div>
        <p v-else class="empty">Everything has been paid back.</p>
      </section>

      <section v-if="collected.length" class="section">
        <div class="section-head"><h2>Collected</h2></div>
        <div class="list">
          <div v-for="lend in collected" :key="lend.id" class="row lend-static">
            <span class="row__icon material-symbols-outlined">check</span>
            <span class="row__main">
              <span class="row__title">{{ lend.lentTo || lend.name }}</span>
              <span class="row__meta num">Lent {{ formatDate(lend.dueDate) }}</span>
            </span>
            <span class="row__end row__amount num">{{ formatMoney(lend.amount) }}</span>
            <button class="btn btn--ghost btn--small" @click="markUncollected(lend.id)">Undo</button>
          </div>
        </div>
      </section>

      <section v-if="writtenOff.length" class="section">
        <div class="section-head">
          <h2>Written off</h2>
          <span class="num lend-total">{{ formatMoney(writtenOffTotal) }}</span>
        </div>
        <div class="list">
          <div v-for="lend in writtenOff" :key="lend.id" class="row lend-static">
            <span class="row__icon material-symbols-outlined">money_off</span>
            <span class="row__main">
              <span class="row__title">{{ lend.lentTo || lend.name }}</span>
              <span class="row__meta num">Lent {{ formatDate(lend.dueDate) }}</span>
            </span>
            <span class="row__end row__amount num is-zero">{{ formatMoney(lend.amount) }}</span>
            <button class="btn btn--ghost btn--small" @click="undoWriteOff(lend.id)">Undo</button>
          </div>
        </div>
      </section>
    </template>

    <BottomSheet :model-value="!!active" :title="active ? (active.lentTo || active.name) : ''" @update:model-value="v => !v && (active = null)">
      <template v-if="active">
        <p class="figure num">{{ formatMoney(active.amount) }}</p>
        <p class="lend-sheet-meta num">
          Lent {{ formatDate(active.dueDate) }}<template v-if="active.collectionDate"> · ask on {{ formatDate(active.collectionDate) }}</template>
        </p>
        <p v-if="active.notes" class="lend-sheet-meta">{{ active.notes }}</p>

        <template v-if="confirmWriteOff">
          <p class="notice notice--negative lend-confirm">
            <span class="material-symbols-outlined">money_off</span>
            <span>Write off {{ formatMoney(active.amount) }} from {{ active.lentTo || active.name }}? You can undo this later.</span>
          </p>
          <div class="btn-row">
            <button class="btn btn--outline" @click="confirmWriteOff = false">Keep it</button>
            <button class="btn btn--danger" @click="writeOff(active.id)">Write off</button>
          </div>
        </template>
        <template v-else>
          <button class="btn btn--primary btn--block lend-main" @click="markCollected(active.id)">Mark as collected</button>
          <div class="btn-row">
            <button class="btn btn--outline" @click="sendWhatsApp(active)">Remind on WhatsApp</button>
            <button class="btn btn--danger" @click="confirmWriteOff = true">Write off</button>
          </div>
        </template>
      </template>
    </BottomSheet>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import { useFinanceStore } from '../stores/financeStore'
import { useAccountsStore } from '../stores/accountsStore'
import { formatMoney } from '../utils/format'
import { format, parseISO } from 'date-fns'
import { showToast } from '../utils/toast'
import PageHead from '../components/layout/PageHead.vue'
import PersonAvatar from '../components/shared/PersonAvatar.vue'
import BottomSheet from '../components/shared/BottomSheet.vue'

const financeStore = useFinanceStore()
const accounts = useAccountsStore()
const $q = useQuasar()

const allLends = computed(() =>
  financeStore.expenses.filter(e => e.category === 'lend')
)

const pending = computed(() =>
  allLends.value.filter(e => !e.collected && !e.writtenOff)
    .sort((a, b) => new Date(a.collectionDate || a.dueDate || 0) - new Date(b.collectionDate || b.dueDate || 0))
)

const writtenOff = computed(() =>
  allLends.value.filter(e => e.writtenOff && !e.collected)
    .sort((a, b) => new Date(b.dueDate || 0) - new Date(a.dueDate || 0))
)

const collected = computed(() =>
  allLends.value.filter(e => e.collected)
    .sort((a, b) => new Date(b.dueDate || 0) - new Date(a.dueDate || 0))
)

const active = ref(null)
const confirmWriteOff = ref(false)

function openLend(lend) {
  active.value = lend
  confirmWriteOff.value = false
}

const pendingByPerson = computed(() => {
  const map = new Map()
  for (const lend of pending.value) {
    const name = lend.lentTo || lend.name || 'Unknown'
    const row = map.get(name) || { name, total: 0, count: 0 }
    row.total += lend.amount || 0
    row.count += 1
    map.set(name, row)
  }
  return [...map.values()].sort((a, b) => b.total - a.total)
})

const writtenOffTotal = computed(() =>
  writtenOff.value.reduce((s, e) => s + (e.amount || 0), 0)
)

const totalOutstanding = computed(() =>
  pending.value.reduce((s, e) => s + (e.amount || 0), 0)
)

function formatDate(d) {
  try { return format(parseISO(d), 'd MMM') } catch { return '' }
}

function markCollected(id) {
  active.value = null
  const lend = financeStore.expenses.find(e => e.id === id)
  if (!lend) return
  if (!accounts.tracking) {
    saveCollected(lend, null)
    return
  }
  const guess = accounts.getAccount(accounts.expenseAccountId(lend)) || accounts.defaultLkr
  const items = ['lkr', 'cash'].flatMap(w => accounts.accountsIn(w)).map(a => ({ label: a.name, value: a.id }))
  $q.dialog({
    title: `${lend.lentTo || lend.name} paid you back?`,
    message: `Where did the LKR ${formatMoney(lend.amount)} land?`,
    options: { type: 'radio', model: items.some(i => i.value === guess?.id) ? guess.id : items[0]?.value, items },
    cancel: { label: 'Not yet', flat: true, color: 'dark' },
    ok: { label: 'Collected', unelevated: true, color: 'dark' }
  }).onOk(accountId => saveCollected(lend, accounts.getAccount(accountId)))
}

async function saveCollected(lend, into) {
  await financeStore.updateExpense(lend.id, {
    collected: true,
    status: 'paid',
    ...(into ? { collectedAccountId: into.id, collectedAt: Date.now() } : {})
  })
  showToast(into ? `Collected into ${into.name}` : 'Marked as collected')
}

function sendWhatsApp(lend) {
  const name = lend.lentTo || lend.name || 'Friend'
  const amount = Math.round(lend.amount).toLocaleString()
  const note = lend.notes ? ` (${lend.notes})` : ''
  const msg = `Hey ${name}, just a friendly reminder - you owe me LKR ${amount}${note}. Let me know when you can settle up.`
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
}

async function markUncollected(id) {
  await financeStore.updateExpense(id, { collected: false, collectedAccountId: undefined, collectedAt: undefined })
  showToast('Marked as uncollected', 'info')
}

async function writeOff(id) {
  active.value = null
  await financeStore.updateExpense(id, { writtenOff: true })
  showToast('Written off, you can undo this below', 'info')
}

async function undoWriteOff(id) {
  await financeStore.updateExpense(id, { writtenOff: false })
  showToast('Moved back to pending', 'info')
}
</script>

<style lang="scss" scoped>
.lend-people {
  margin: 12px 0 0;
  padding-top: 8px;
  border-top: 1px solid var(--rule);

  > div { display: flex; justify-content: space-between; padding: 4px 0; }
  dt span { color: var(--muted); }
  dd { margin: 0; }
}

.lend-static {
  cursor: default;
  &:active { background: none; }
}

.lend-total { font-size: var(--fs-body); font-weight: 500; }

.lend-sheet-meta { color: var(--muted); margin-top: 2px; }
.lend-main { margin-top: 16px; }
.lend-confirm { margin-top: 16px; }
</style>
