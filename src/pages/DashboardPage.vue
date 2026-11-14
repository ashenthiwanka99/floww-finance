<template>
  <q-page class="home">
    <header class="home-top">
      <img src="/floww-mark.svg" alt="Floww" class="home-mark" width="28" height="28" />
      <div class="home-title">
        <h1>{{ monthName }}</h1>
        <p class="num">{{ cycleLine }}</p>
      </div>
    </header>

    <section v-if="!accounts.tracking" class="panel panel--pad home-setup">
      <p class="home-setup__title">Track every account</p>
      <p class="home-setup__text">Put Nations Trust Bank, Commercial Bank and your cash into three wallets. Floww then keeps each balance and checks it against your bank SMS.</p>
      <router-link to="/wallets/setup" class="btn btn--primary">Set up wallets</router-link>
    </section>

    <section class="panel plan" aria-labelledby="left-label">
      <p id="left-label" class="figure-label">Left to spend</p>
      <p class="figure figure--lead" :class="{ 'is-negative': plan.left < 0 }">
        <span class="unit">LKR</span>{{ plan.left < 0 ? '-' : '' }}{{ formatMoney(Math.abs(plan.left)) }}
      </p>
      <div class="track plan__track" role="img" :aria-label="plan.aria">
        <span class="fill--hue" :style="{ width: pct(plan.bar.out) }" />
        <span class="fill--pale" :style="{ width: pct(plan.bar.due) }" />
        <span class="fill--over" :style="{ width: pct(plan.bar.over) }" />
      </div>
      <p class="plan__after num">{{ plan.after }}</p>
      <div class="plan__figures">
        <div v-for="f in plan.figures" :key="f.key">
          <p class="figure-label"><span v-if="f.key !== 'in'" class="key" :class="`key--${f.key}`" />{{ f.label }}</p>
          <p class="plan__value num" :class="{ 'is-zero': !f.value }">{{ formatMoney(f.value) }}</p>
          <p v-if="f.sub" class="plan__sub num">{{ f.sub }}</p>
        </div>
      </div>
      <p v-for="n in plan.notes" :key="n" class="plan__note num">{{ n }}</p>
    </section>

    <nav v-if="accounts.tracking" class="wallet-tiles" aria-label="Wallets">
      <router-link v-for="w in tiles" :key="w.key" :to="w.to" class="wallet-tile">
        <span class="wallet-tile__label">{{ w.label }}</span>
        <span class="wallet-tile__amount num">{{ w.amount }}</span>
        <span class="wallet-tile__sub num" :class="{ 'wallet-tile__sub--warn': w.warn }">{{ w.sub }}</span>
      </router-link>
    </nav>

    <div v-if="notices.length" class="home-notices">
      <p v-for="n in notices" :key="n.text" class="notice" :class="n.tone ? `notice--${n.tone}` : ''">
        <span class="material-symbols-outlined">{{ n.icon }}</span>
        <span>{{ n.text }} <router-link v-if="n.to" :to="n.to">{{ n.action }}</router-link><button v-else-if="n.act" type="button" @click="n.act">{{ n.action }}</button></span>
      </p>
    </div>

    <section v-if="smsFresh.length" class="section" aria-labelledby="sms-head">
      <div class="section-head">
        <h2 id="sms-head">New from your bank</h2>
        <router-link to="/sms-import">See all</router-link>
      </div>
      <div class="list">
        <SmsRow v-for="tx in smsFresh.slice(0, 3)" :key="tx.fingerprint" :tx="tx" @open="openSms" @add="addSms" />
        <div v-if="smsFresh.length > 1" class="row sms-foot">
          <span class="row__main row__meta num">{{ smsFresh.length }} new<template v-if="smsOut">, LKR {{ formatMoney(smsOut) }} spent</template></span>
          <button type="button" class="btn btn--primary btn--small" @click="addAllSms">Add all {{ smsFresh.length }}</button>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Bills to pay</h2>
        <router-link to="/bills">All bills</router-link>
      </div>
      <div v-if="plan.unpaid.length" class="list">
        <ExpenseRow
          v-for="e in plan.unpaid.slice(0, 3)"
          :key="e.id"
          :expense="e"
          :can-delete="false"
          @mark-paid="markPaid"
          @edit="edit"
        />
        <router-link v-if="plan.unpaid.length > 3" to="/bills" class="row list-more num">
          {{ plan.unpaid.length - 3 }} more, LKR {{ formatMoney(dueRest) }}
        </router-link>
      </div>
      <p v-else class="empty">Nothing left to pay in this cycle.</p>
    </section>

    <section v-if="pace" class="section">
      <div class="section-head">
        <h2>Spending so far</h2>
        <router-link to="/expenses">By day</router-link>
      </div>
      <div class="panel pace-panel">
        <p class="pace-finding num">
          <template v-if="paceFinding.diff !== null">
            <span class="pace-finding__lead">{{ paceFinding.lead }}</span> {{ paceFinding.rest }}
          </template>
          <template v-else>{{ paceFinding.rest }}</template>
        </p>
        <PaceChart :dates="pace.dates" :current="pace.current" :previous="pace.previous" />
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Where it went</h2>
        <router-link to="/monthly-report">Report</router-link>
      </div>
      <CategoryList v-if="categories.length" :categories="categories" :total="spentTotal" :limit="4" />
      <p v-else class="empty">No spending recorded in this cycle yet.</p>
    </section>

    <EditExpenseSheet v-model="showEdit" :expense="editing" />
    <SmsEditSheet v-model="showSms" :transaction="smsActive" :existing-edit="smsActiveEdit" @import="onSmsEdit" @skip="onSmsSkip" />
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { format, parseISO, addMonths, subDays, differenceInCalendarDays } from 'date-fns'
import { useFinanceStore } from '../stores/financeStore'
import { useAccountsStore } from '../stores/accountsStore'
import { useReminders } from '../composables/useReminders'
import { useExpenseActions } from '../composables/useExpenseActions'
import { formatMoney, getBudgetMonth, getCycleWindow } from '../utils/format'
import { money } from '../utils/wallets'
import { cycleBounds, previousMonth, dailySpending, cumulative, todayIndex } from '../utils/cycleSeries'
import PaceChart from '../components/charts/PaceChart.vue'
import CategoryList from '../components/shared/CategoryList.vue'
import ExpenseRow from '../components/expenses/ExpenseRow.vue'
import EditExpenseSheet from '../components/expenses/EditExpenseSheet.vue'
import SmsRow from '../components/sms/SmsRow.vue'
import SmsEditSheet from '../components/sms/SmsEditSheet.vue'
import { useSmsInbox } from '../composables/useSmsInbox'
import { useBankChecks } from '../composables/useBankChecks'
import { useSmsImportStore } from '../stores/smsImportStore'
import { showToast } from '../utils/toast'

const finance = useFinanceStore()
const accounts = useAccountsStore()
const { overdue } = useReminders()
const { markPaid } = useExpenseActions()
const { cardsOff } = useBankChecks()

function startCycle(income) {
  const res = accounts.updateIncome(income.id, { kind: 'salary', name: 'Salary' })
  if (res.success) showToast(`New cycle started on ${format(parseISO(income.date), 'd MMM')}`, 'paid')
}

const salaryDates = computed(() => Object.values(finance.monthlyIncomes || {}).map(m => m?.receivedDate || '').join('|'))
const month = computed(() => (salaryDates.value, finance.currentMonth, getBudgetMonth()))

const showEdit = ref(false)
const editing = ref(null)
function edit(e) {
  editing.value = e
  showEdit.value = true
}

const smsStore = useSmsImportStore()
const { fresh: smsFresh, addOne, addAll, skip, draft } = useSmsInbox()
const smsOut = computed(() => smsFresh.value.reduce((s, tx) => {
  const d = draft(tx)
  return d.kind === 'expense' ? s + (d.amount || 0) : s
}, 0))
const showSms = ref(false)
const smsActive = ref(null)
const smsActiveEdit = ref(null)

function openSms(tx) {
  smsActive.value = tx
  smsActiveEdit.value = smsStore.getPendingEdit(tx.fingerprint)
  showSms.value = true
}

function addSms(tx) {
  const name = draft(tx).name
  if (addOne(tx)) showToast(`${name} added`, 'paid')
  else showToast('Could not add it. Open it to check the details.', 'error')
}

function onSmsEdit({ expense }) {
  if (!smsActive.value) return
  if (addOne(smsActive.value, expense)) showToast(`${expense.name || 'Record'} added`, 'paid')
  else showToast('Could not add it', 'error')
}

function onSmsSkip(tx) {
  skip(tx)
  showToast(`${draft(tx).name} skipped`, 'info')
}

async function addAllSms() {
  const { added, failed } = await addAll()
  if (failed) showToast(`Added ${added}, ${failed} need a look`, 'warning')
  else showToast(`Added ${added} from your bank`, 'paid')
}

const monthName = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return format(new Date(y, m - 1), 'MMMM')
})

const cycle = computed(() => {
  const w = getCycleWindow(month.value)
  if (!w?.start) return null
  const start = parseISO(w.start)
  return { start, end: w.end ? parseISO(w.end) : subDays(addMonths(start, 1), 1), estimated: !w.end }
})

const cycleLine = computed(() => {
  const c = cycle.value
  if (!c) return 'No salary date recorded for this cycle'
  const days = differenceInCalendarDays(c.end, new Date()) + 1
  return `${format(c.start, 'd MMM')} to ${c.estimated ? 'about ' : ''}${format(c.end, 'd MMM')} · ${days > 1 ? `${days} days left` : 'last day'}`
})

const pct = v => `${Math.max(0, Math.min(1, v || 0)) * 100}%`

const legacyPlan = computed(() => {
  const m = month.value
  const rows = finance.expenses.filter(e => e.monthYear === m)
  const sum = list => list.reduce((s, e) => s + (e.amount || 0), 0)
  const paid = rows.filter(e => e.status === 'paid')
  const excluded = finance.excludedFromSpending
  const moved = finance.getIncomeForMonth(m) + sum((finance.loanDisbursements || []).filter(d => d?.monthYear === m))
  const left = moved - sum(paid.filter(e => !excluded.includes(e.category)))
    - sum(paid.filter(e => ['savings', 'lend', 'loans', 'creditCardPayment'].includes(e.category)))
    + sum(paid.filter(e => e.paidByCardId))
  const out = moved - left
  const unpaid = rows
    .filter(e => e.status !== 'paid' && !['savings', 'cashWithdrawal', 'lend'].includes(e.category))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
  const due = sum(unpaid)
  const total = Math.max(moved, out + due, 1)
  const cardCharged = sum(paid.filter(e => e.paidByCardId))
  return {
    left,
    unpaid,
    bar: {
      out: Math.min(out, moved) / total,
      due: Math.min(due, Math.max(0, moved - out)) / total,
      over: Math.max(0, out + due - moved) / total
    },
    after: left - due < 0 ? `Unpaid bills are LKR ${formatMoney(due - left)} more than what is left` : `LKR ${formatMoney(left - due)} after unpaid bills`,
    figures: [
      { key: 'in', label: 'Moved in', value: moved },
      { key: 'out', label: 'Paid out', value: out },
      { key: 'due', label: 'Unpaid', value: due }
    ],
    notes: cardCharged > 0 ? [`Not counting LKR ${formatMoney(cardCharged)} on cards, paid from the next salary.`] : [],
    aria: `Moved in LKR ${formatMoney(moved)}, paid out ${formatMoney(out)}, unpaid ${formatMoney(due)}`
  }
})

const plan = computed(() => {
  if (!accounts.tracking) return legacyPlan.value
  const s = accounts.cycleSummary(month.value)
  const notes = []
  if (s.cardCharged > 0) notes.push(`Not counting LKR ${formatMoney(s.cardCharged)} spent on cards. It counts when you pay the card.`)
  if (s.usdPaid > 0) notes.push(`Not counting LKR ${formatMoney(s.usdPaid)} paid from your dollar wallet.`)
  return {
    left: s.left,
    unpaid: s.unpaid,
    bar: s.bar,
    after: s.cameIn > 0 ? `LKR ${formatMoney(s.cameIn)} came in this cycle` : 'Nothing has come in this cycle yet',
    figures: [
      { key: 'in', label: 'LKR and cash', value: s.money },
      { key: 'out', label: 'Paid out', value: s.wentOut },
      { key: 'due', label: 'Bills to pay', value: s.bills }
    ],
    notes,
    aria: `LKR ${formatMoney(s.money)} in your LKR wallet and cash, LKR ${formatMoney(s.bills)} of bills to pay, LKR ${formatMoney(s.wentOut)} paid out this cycle`
  }
})

const dueRest = computed(() => plan.value.unpaid.slice(3).reduce((s, e) => s + (e.amount || 0), 0))

const tiles = computed(() => {
  const t = accounts.walletTotals
  const warn = key => accounts.offAccounts.some(x => x.account.wallet === key)
  const unsetSub = key => (t.unset[key] ? 'Balance not set' : null)
  const count = key => `${t.count[key]} ${t.count[key] === 1 ? 'account' : 'accounts'}`
  const to = key => {
    const list = accounts.accountsIn(key)
    return list.length === 1 ? `/accounts/${list[0].id}` : '/wallets'
  }
  return [
    { key: 'lkr', label: 'LKR wallet', amount: formatMoney(t.lkr), sub: warn('lkr') ? 'Check balance' : (unsetSub('lkr') || count('lkr')), warn: warn('lkr'), to: to('lkr') },
    { key: 'usd', label: 'Dollars', amount: money(t.usd, 'USD'), sub: warn('usd') ? 'Check balance' : (unsetSub('usd') || (accounts.fxRate ? `LKR ${formatMoney(t.usd * accounts.fxRate)}` : count('usd'))), warn: warn('usd'), to: to('usd') },
    { key: 'cash', label: 'Cash, LKR', amount: formatMoney(t.cash), sub: warn('cash') ? 'Check balance' : (unsetSub('cash') || 'On hand'), warn: warn('cash'), to: to('cash') }
  ]
})

const categories = computed(() => {
  const totals = {}
  for (const e of finance.expenses) {
    if (e.monthYear !== month.value || e.status !== 'paid' || finance.excludedFromSpending.includes(e.category)) continue
    totals[e.category] = (totals[e.category] || 0) + e.amount
  }
  const rows = Object.entries(totals)
    .map(([key, amount]) => ({ key, amount, limit: Number(finance.budgetLimits?.[key]) || 0 }))
    .sort((a, b) => b.amount - a.amount)
  const max = rows[0]?.amount || 1
  return rows.map(r => ({ ...r, pct: (r.amount / max) * 100, over: r.limit > 0 && r.amount > r.limit }))
})
const spentTotal = computed(() => categories.value.reduce((s, c) => s + c.amount, 0))

const pace = computed(() => {
  const b = cycleBounds(month.value)
  if (!b) return null
  const upto = Math.max(0, Math.min(b.days - 1, todayIndex(b)))
  const current = cumulative(dailySpending(finance, month.value, b)).slice(0, upto + 1)
  const pm = previousMonth(month.value)
  const pb = cycleBounds(pm)
  const previous = pb ? cumulative(dailySpending(finance, pm, pb)) : null
  return { dates: b.dates, current, previous: previous && previous[previous.length - 1] > 0 ? previous : null, upto }
})

const paceFinding = computed(() => {
  const p = pace.value
  const now = p.current[p.current.length - 1] || 0
  if (!p.previous) return { diff: null, rest: `LKR ${formatMoney(now)} so far. There is no earlier cycle to compare with yet.` }
  const then = p.previous[Math.min(p.upto, p.previous.length - 1)]
  const diff = Math.round(now - then)
  const against = `by day ${p.upto + 1} last cycle`
  if (diff === 0) return { diff: 0, lead: 'The same', rest: `as ${against}` }
  return { diff, lead: `LKR ${formatMoney(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}`, rest: `than ${against}` }
})

const notices = computed(() => {
  const list = []
  const m = month.value
  const waitingSalary = accounts.salaryWaiting
  if (waitingSalary) {
    list.push({
      icon: 'work',
      text: `${money(waitingSalary.amount, waitingSalary.currency)} landed on ${format(parseISO(waitingSalary.date), 'd MMM')} but no new cycle started.`,
      act: () => startCycle(waitingSalary),
      action: 'Make it your salary'
    })
  }
  for (const line of cardsOff.value) {
    list.push({
      tone: 'warning',
      icon: 'credit_card',
      text: `Your bank says ${money(line.bank)} is owed on your cards. Floww has ${money(line.floww)}.`,
      to: line.waiting ? '/sms-import' : '/wallets',
      action: line.waiting ? `Add ${line.waiting} card ${line.waiting === 1 ? 'message' : 'messages'}` : 'Check'
    })
  }
  for (const { account, status } of accounts.offAccounts) {
    list.push({ tone: 'warning', icon: 'warning', text: `${account.name} is ${money(Math.abs(status.diff), account.currency)} off from your bank.`, to: `/accounts/${account.id}`, action: 'Fix it' })
  }
  if (accounts.tracking) {
    const unset = accounts.active.filter(a => !a.openingAt)
    if (unset.length) list.push({ icon: 'info', text: `${unset.map(a => a.name).join(', ')} has no balance yet.`, to: `/accounts/${unset[0].id}`, action: 'Set it' })
  }
  if (!finance.hasRecordedIncome(m)) {
    list.push({ icon: 'info', text: 'Record your salary when it lands, so the new cycle starts on the right day.', to: '/salary', action: 'Salary' })
  } else if (!accounts.tracking && finance.usesTransferBudget(m) && finance.lkrMovedForMonth(m) === 0) {
    list.push({ icon: 'swap_horiz', text: 'Salary recorded, but nothing has moved to LKR yet.', to: '/wallets/setup', action: 'Set up wallets' })
  }
  const older = overdue.value.filter(e => !e.isLendReminder && e.monthYear !== m)
  if (older.length) {
    const sum = older.reduce((s, e) => s + e.amount, 0)
    list.push({ tone: 'negative', icon: 'error', text: `${older.length} unpaid from earlier cycles, LKR ${formatMoney(sum)}.`, to: '/bills', action: 'Review' })
  }
  return list
})
</script>

<style lang="scss" scoped>
.home-top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
  min-height: 56px;
  margin-bottom: 12px;
}

.home-mark { flex: none; }

.home-title {
  min-width: 0;
  h1 { font-size: var(--fs-title); line-height: 30px; }
  p { color: var(--muted); font-size: var(--fs-small); line-height: 16px; }
}

.home-setup { margin-bottom: 12px; }
.home-setup__title { font-size: var(--fs-section); font-weight: 600; margin-bottom: 4px; }
.home-setup__text { color: var(--muted); margin-bottom: 16px; }

.plan { padding: var(--card-pad); }

.plan__track { margin-top: 12px; }

.plan__after {
  margin-top: 8px;
  font-size: var(--fs-body);
  color: var(--muted);
}

.plan__figures {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--rule);

  > div { min-width: 0; }
  > div + div { padding-left: 12px; border-left: 1px solid var(--rule); }
}

.plan__value { font-size: var(--fs-section); line-height: 24px; font-weight: 500; margin-top: 2px; }
.plan__sub { font-size: var(--fs-small); color: var(--muted); }

.key {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-right: 6px;
  vertical-align: 0;
  &--out { background: var(--hue); }
  &--due { background: var(--hue-pale); }
}

.plan__note {
  margin-top: 12px;
  font-size: var(--fs-small);
  line-height: 16px;
  color: var(--muted);
  & + .plan__note { margin-top: 4px; }
}

.wallet-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.wallet-tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 12px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  &:active { background: var(--raised); }
}

.wallet-tile__label { font-size: var(--fs-small); line-height: 16px; color: var(--muted); }
.wallet-tile__amount { font-size: var(--fs-section); line-height: 22px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wallet-tile__sub { font-size: var(--fs-small); line-height: 16px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wallet-tile__sub--warn { color: var(--warning); }

.home-notices {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.list-more {
  justify-content: center;
  color: var(--muted);
  font-size: var(--fs-body);
  min-height: 44px;
}

.sms-foot {
  cursor: default;
  &:active { background: none; }
}

.pace-panel { padding: 12px var(--card-pad) 12px; }

.pace-finding {
  font-size: var(--fs-body);
  line-height: 20px;
  margin-bottom: 8px;
  &__lead { font-weight: 600; }
}
</style>
