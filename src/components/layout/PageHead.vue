<template>
  <header class="page-head">
    <button v-if="back" class="icon-btn icon-btn--back" aria-label="Back" @click="goBack">
      <span class="material-symbols-outlined">arrow_back</span>
    </button>
    <h1>{{ title }}</h1>
    <slot />
  </header>
</template>

<script setup>
import { useRouter } from 'vue-router'

const props = defineProps({
  title: { type: String, required: true },
  back: { type: [Boolean, String], default: false }
})

const router = useRouter()

function goBack() {
  if (window.history.state?.back) router.back()
  else router.push(typeof props.back === 'string' ? props.back : '/more')
}
</script>
