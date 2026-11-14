<template>
  <q-page>
    <q-pull-to-refresh @refresh="onRefresh" color="dark">
      <PageHead title="Credit cards" back>
        <button class="btn btn--primary btn--small" @click="showAddCard = true">
          <span class="material-symbols-outlined">add</span>Add card
        </button>
      </PageHead>

      <template v-if="cardStore.cards.length">
        <div class="kpis">
          <div>
            <p class="figure-label">Owed</p>
            <p class="figure num" :class="{ 'is-zero': !cardStore.totalOutstanding }">{{ formatMoney(cardStore.totalOutstanding) }}</p>
          </div>
          <div>
            <p class="figure-label">Available</p>
            <p class="figure num">{{ formatMoney(cardStore.totalAvailable) }}</p>
          </div>
        </div>

        <section class="section">
          <div class="section-head">
            <h2>Cards</h2>
            <button @click="showInstallment = true">Buy on installment</button>
          </div>
          <div class="cc-stack">
            <CreditCardTile
              v-for="card in cardStore.cards"
              :key="card.id"
              :card="card"
              @click="$router.push(`/credit-cards/${card.id}`)"
            />
          </div>
        </section>
      </template>

      <div v-else class="empty">
        <p class="empty__title">No cards yet</p>
        <p class="empty__subtitle">Add a card to track what you owe on it and when it is due.</p>
        <button type="button" class="btn btn--primary" @click="showAddCard = true">Add a card</button>
      </div>
    </q-pull-to-refresh>

    <AddCardSheet v-model="showAddCard" />
    <CardInstallmentSheet v-model="showInstallment" />
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useCreditCardStore } from '../stores/creditCardStore'
import { useCloudSync } from '../composables/useCloudSync'
import { formatMoney } from '../utils/format'
import PageHead from '../components/layout/PageHead.vue'
import CreditCardTile from '../components/creditCards/CreditCardTile.vue'
import AddCardSheet from '../components/creditCards/AddCardSheet.vue'
import CardInstallmentSheet from '../components/creditCards/CardInstallmentSheet.vue'

const cardStore = useCreditCardStore()
const { downloadFromCloud } = useCloudSync()

const showAddCard = ref(false)
const showInstallment = ref(false)

async function onRefresh(done) {
  try { await downloadFromCloud() } catch {}
  done()
}
</script>

<style lang="scss" scoped>
.cc-stack { display: grid; gap: 12px; }
</style>
