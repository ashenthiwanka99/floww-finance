<template>
  <q-page>
    <PageHead title="Bank SMS" back>
      <button class="icon-btn icon-btn--edge" aria-label="Check messages again" :disabled="scanning" @click="scan({ ask: true })">
        <span class="material-symbols-outlined" :class="{ spin: scanning }">refresh</span>
      </button>
    </PageHead>
    <p class="page-sub">Commercial Bank and Nations Trust Bank messages. Adding one turns it into an expense, money in or a move.</p>

    <div class="seg sms-range" role="group" aria-label="How far back">
      <button
        v-for="d in [7, 30, 90]"
        :key="d"
        type="button"
        :aria-pressed="smsStore.scanRangeDays === d"
        @click="setRange(d)"
      >{{ d }} days</button>
    </div>

    <div v-if="needsPermission" class="panel panel--pad sms-gap">
      <p class="sms-ask__title">Let Floww read bank messages</p>
      <p class="sms-ask__text">Only messages from your banks are read, on this phone. Nothing is added until you tap Add.</p>
      <button type="button" class="btn btn--primary btn--block" @click="scan({ ask: true })">Allow SMS access</button>
    </div>

    <p v-else-if="error" class="notice notice--negative sms-gap">
      <span class="material-symbols-outlined">error</span>
      <span>{{ error }}</span>
    </p>

    <section v-if="fresh.length" class="section sms-gap">
      <p class="group-label num"><span>To add, {{ fresh.length }}</span><span v-if="freshTotal">LKR {{ formatMoney(freshTotal) }} spent</span></p>
      <div class="list">
        <SmsRow v-for="tx in fresh" :key="tx.fingerprint" :tx="tx" @open="openEditor" @add="addOne" />
      </div>
    </section>

    <section v-if="maybe.length" class="section" :class="{ 'sms-gap': !fresh.length }">
      <p class="group-label num"><span>Maybe already in Floww, {{ maybe.length }}</span></p>
      <p class="field-help sms-maybe-help">Each of these looks like something you added yourself. Skip it if it is the same one, or add it if it is not. Add all leaves them out.</p>
      <div class="list">
        <SmsRow v-for="tx in maybe" :key="tx.fingerprint" :tx="tx" @open="openEditor" @add="addOne" />
      </div>
    </section>

    <p v-else-if="!fresh.length && scanning && !scanned" class="empty sms-gap">Checking your bank messages.</p>
    <p v-else-if="!fresh.length && scanned && !error && !needsPermission" class="empty sms-gap num">
      Everything from the last {{ smsStore.scanRangeDays }} days is added. New bank messages show up here and on Home.
    </p>

    <section v-if="done.length" class="section">
      <button type="button" class="group-label sms-done-toggle num" :aria-expanded="showDone" @click="showDone = !showDone">
        <span>{{ done.length }} added or skipped</span>
        <span class="material-symbols-outlined">{{ showDone ? 'expand_less' : 'expand_more' }}</span>
      </button>
      <div v-if="showDone" class="list">
        <SmsRow
          v-for="tx in done"
          :key="tx.fingerprint"
          :tx="tx"
          :state="isSkipped(tx.fingerprint) ? 'skipped' : 'added'"
          @open="onDoneTap"
        />
      </div>
    </section>

    <div v-if="fresh.length > 1" class="sms-bar">
      <button type="button" class="btn btn--ghost" @click="onSkipAll">Skip all</button>
      <button type="button" class="btn btn--primary sms-bar__add" :disabled="adding" @click="onAddAll">Add all {{ fresh.length }}</button>
    </div>

    <SmsEditSheet
      v-model="showEditSheet"
      :transaction="activeTransaction"
      :existing-edit="activeExistingEdit"
      @import="onEditImport"
      @skip="onSkip"
    />
  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { formatMoney } from '../utils/format'
import { showToast } from '../utils/toast'
import { useSmsImportStore } from '../stores/smsImportStore'
import { useSmsInbox } from '../composables/useSmsInbox'
import PageHead from '../components/layout/PageHead.vue'
import SmsRow from '../components/sms/SmsRow.vue'
import SmsEditSheet from '../components/sms/SmsEditSheet.vue'

const smsStore = useSmsImportStore()
const { fresh, maybe, done, scanning, scanned, error, needsPermission, isSkipped, scan, addOne: add, addAll, skip, skipAll, restore, draft } = useSmsInbox()

const showDone = ref(false)
const adding = ref(false)
const showEditSheet = ref(false)
const activeTransaction = ref(null)
const activeExistingEdit = ref(null)

const freshTotal = computed(() => fresh.value.reduce((s, tx) => {
  const d = draft(tx)
  return d.kind === 'expense' ? s + (d.amount || 0) : s
}, 0))

onMounted(() => {
  if (!scanned.value) scan()
})

function setRange(days) {
  smsStore.scanRangeDays = days
  scan({ ask: true })
}

function openEditor(tx) {
  activeTransaction.value = tx
  activeExistingEdit.value = smsStore.getPendingEdit(tx.fingerprint)
  showEditSheet.value = true
}

function addOne(tx) {
  const name = draft(tx).name
  if (add(tx)) showToast(`${name} added`, 'paid')
  else showToast('Could not add it', 'error')
}

function onEditImport({ expense }) {
  const tx = activeTransaction.value
  if (!tx) return
  if (add(tx, expense)) showToast(`${expense.name} added`, 'paid')
  else showToast('Could not add it', 'error')
}

function onSkip(tx) {
  skip(tx)
  showToast(`${draft(tx).name} skipped`, 'info')
}

function onDoneTap(tx) {
  if (!isSkipped(tx.fingerprint)) return
  restore(tx)
  showToast(`${draft(tx).name} is back in To add`, 'info')
}

async function onAddAll() {
  adding.value = true
  const { added, failed } = await addAll()
  adding.value = false
  if (failed) showToast(`Added ${added}, ${failed} could not be added`, 'warning')
  else showToast(`Added ${added} from your bank`, 'paid')
}

function onSkipAll() {
  const n = skipAll()
  showToast(`Skipped ${n}. Open "added or skipped" to bring one back.`, 'info')
}
</script>

<style lang="scss" scoped>
.sms-range { margin-top: 4px; }
.sms-gap { margin-top: 16px; }

.sms-ask__title { font-size: var(--fs-section); font-weight: 600; line-height: 24px; }
.sms-ask__text { color: var(--muted); margin: 4px 0 16px; }

.sms-done-toggle {
  width: 100%;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--fs-small);
  color: var(--muted);
  cursor: pointer;
  align-items: center;
}

.sms-bar {
  position: sticky;
  bottom: calc(var(--nav-height) + 12px + env(safe-area-inset-bottom, 0px));
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
}

.sms-bar__add { flex: 1; }

.icon-btn--edge { margin-right: -11px; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.sms-maybe-help { margin: -2px 2px 8px; }
</style>
