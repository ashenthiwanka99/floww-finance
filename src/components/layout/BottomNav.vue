<template>
  <nav class="bottom-nav" aria-label="Main">
    <router-link
      v-for="tab in tabs.slice(0, 2)"
      :key="tab.to"
      :to="tab.to"
      class="nav-item"
      :class="{ active: isActive(tab.to) }"
    >
      <span class="material-symbols-outlined" :class="{ filled: isActive(tab.to) }">{{ tab.icon }}</span>
      <span class="nav-label">{{ tab.label }}</span>
    </router-link>

    <button class="nav-add" :aria-label="smsCount ? `Add expense, ${smsCount} new from bank SMS` : 'Add expense'" @click="$emit('add')">
      <span class="material-symbols-outlined">add</span>
      <span v-if="smsCount" class="nav-add__badge num" aria-hidden="true">{{ smsCount > 9 ? '9+' : smsCount }}</span>
    </button>

    <router-link
      v-for="tab in tabs.slice(2)"
      :key="tab.to"
      :to="tab.to"
      class="nav-item"
      :class="{ active: isActive(tab.to) }"
    >
      <span class="nav-icon-wrap">
        <span class="material-symbols-outlined" :class="{ filled: isActive(tab.to) }">{{ tab.icon }}</span>
        <span v-if="tab.badge" class="nav-badge num" :aria-label="`${tab.badge} overdue`">{{ tab.badge }}</span>
      </span>
      <span class="nav-label">{{ tab.label }}</span>
    </router-link>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useReminders } from '../../composables/useReminders'
import { useSmsInbox } from '../../composables/useSmsInbox'

defineEmits(['add'])

const route = useRoute()
const { overdueCount } = useReminders()
const { fresh } = useSmsInbox()
const smsCount = computed(() => fresh.value.length)

const tabs = computed(() => [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/expenses', icon: 'receipt_long', label: 'Activity' },
  { to: '/bills', icon: 'event', label: 'Bills', badge: overdueCount.value || 0 },
  { to: '/more', icon: 'menu', label: 'More' }
])

const homeRoutes = ['/wallets', '/accounts']
const moreRoutes = ['/more', '/salary', '/credit-cards', '/installments', '/loans', '/lend-tracker',
  '/fuel-tracker', '/monthly-report', '/payment-history', '/net-worth', '/sms-import',
  '/trash', '/profile', '/custom-categories', '/budget-limits', '/cloud-sync', '/backup']

function isActive(to) {
  if (to === '/') return route.path === '/' || homeRoutes.some(p => route.path.startsWith(p))
  if (to === '/more') return moreRoutes.some(p => route.path.startsWith(p))
  return route.path.startsWith(to)
}
</script>

<style lang="scss" scoped>
.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: center;
  height: calc(var(--nav-height) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.nav-item {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--faint);
  text-decoration: none;

  .material-symbols-outlined { font-size: 24px; }
  .filled { font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
  &.active { color: var(--text); }
  &:active { background: var(--raised); }
}

.nav-label { font-size: 12px; line-height: 16px; font-weight: 500; }

.nav-icon-wrap { position: relative; display: flex; }

.nav-badge {
  position: absolute;
  top: -4px;
  left: 16px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--negative);
  color: var(--on-status);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

.nav-add {
  justify-self: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 0;
  background: var(--primary);
  color: var(--on-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s ease;

  .material-symbols-outlined { font-size: 28px; font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; }
  &:active { transform: scale(0.94); }
}

.nav-add { position: relative; }

.nav-add__badge {
  position: absolute;
  top: -4px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--hue);
  color: var(--on-hue);
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  box-shadow: 0 0 0 2px var(--surface);
}
</style>
