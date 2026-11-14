<template>
  <div v-if="templates.length" class="chips quick-templates" aria-label="Add again">
    <button v-for="t in templates" :key="t.name" class="chip" @click="$emit('select', t)">
      <span class="material-symbols-outlined">add</span>{{ t.name }}
    </button>
  </div>
</template>

<script setup>
import { useExpenseTemplates } from '../../composables/useExpenseTemplates'

defineEmits(['select'])

const { templates } = useExpenseTemplates()
</script>
