<template>
  <q-page>
    <PageHead title="Net worth" back />

    <section class="panel panel--pad">
      <p class="figure-label">Assets minus what you owe</p>
      <p class="figure figure--lead" :class="{ 'is-zero': netWorth === 0 }">
        <span class="unit">LKR</span>{{ netWorth < 0 ? '-' : '' }}{{ formatMoney(Math.abs(netWorth)) }}
      </p>
      <div class="nw-split">
        <div>
          <p class="figure-label">Assets</p>
          <p class="nw-value num" :class="{ 'is-zero': !totalAssets }">{{ formatMoney(totalAssets) }}</p>
        </div>
        <div>
          <p class="figure-label">Owed</p>
          <p class="nw-value num" :class="{ 'is-zero': !totalLiabilities }">{{ formatMoney(totalLiabilities) }}</p>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>Assets</h2>
        <button @click="showAddAsset = true">Add asset</button>
      </div>
      <div v-if="assetsList.length" class="list">
        <component :is="a.to ? 'router-link' : 'div'" v-for="a in assetsList" :key="a.id" :to="a.to" class="row" :class="{ 'row--static': !a.to }">
          <span class="row__icon material-symbols-outlined">{{ a.icon }}</span>
          <span class="row__main">
            <span class="row__title">{{ a.name }}</span>
            <span class="row__meta">{{ a.typeLabel }}</span>
          </span>
          <span class="row__end row__amount num">{{ formatMoney(a.balance) }}</span>
        </component>
      </div>
      <p v-else class="empty">No assets yet. Set up your wallets, or add an investment to count it here.</p>
    </section>

    <section class="section">
      <div class="section-head">
        <h2>What you owe</h2>
        <router-link to="/loans">Loans</router-link>
      </div>
      <div v-if="liabilitiesList.length" class="list">
        <router-link v-for="l in liabilitiesList" :key="l.id" :to="l.to || '/loans'" class="row">
          <span class="row__icon material-symbols-outlined">{{ l.icon }}</span>
          <span class="row__main">
            <span class="row__title">{{ l.name }}</span>
            <span v-if="l.lender" class="row__meta">{{ l.lender }}</span>
          </span>
          <span class="row__end row__amount num">{{ formatMoney(l.balance) }}</span>
        </router-link>
      </div>
      <p v-else class="empty">Nothing owed on loans or cards.</p>
    </section>

    <AddAssetSheet v-model="showAddAsset" />
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useNetWorth } from '../composables/useNetWorth'
import { formatMoney } from '../utils/format'
import PageHead from '../components/layout/PageHead.vue'
import AddAssetSheet from '../components/networth/AddAssetSheet.vue'

const { totalAssets, totalLiabilities, netWorth, assetsList, liabilitiesList } = useNetWorth()

const showAddAsset = ref(false)
</script>

<style lang="scss" scoped>
.nw-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--rule);

  > div + div { padding-left: 12px; border-left: 1px solid var(--rule); }
}

.nw-value { font-size: var(--fs-section); line-height: 24px; font-weight: 500; margin-top: 2px; }

.row--static {
  cursor: default;
  &:active { background: none; }
}
</style>
