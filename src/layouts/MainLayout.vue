<template>
  <q-layout view="hHh lpr fFf" class="main-layout">
    <q-page-container>
      <div class="app-container">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </div>
    </q-page-container>

    <AddExpenseSheet v-model="showExpenseSheet" :prefill="expensePrefill" />

    <BottomNav @add="openExpenseSheet()" />
  </q-layout>
</template>

<script setup>
import { ref, provide, watch } from 'vue'
import BottomNav from '../components/layout/BottomNav.vue'
import AddExpenseSheet from '../components/expenses/AddExpenseSheet.vue'

const showExpenseSheet = ref(false)
const expensePrefill = ref(null)

function openExpenseSheet(prefill = null) {
  expensePrefill.value = prefill
  showExpenseSheet.value = true
}

provide('openExpenseSheet', openExpenseSheet)

watch(showExpenseSheet, (open) => {
  if (!open) expensePrefill.value = null
})
</script>
