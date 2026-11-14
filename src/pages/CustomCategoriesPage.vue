<template>
  <q-page>
    <PageHead title="Categories" back>
      <button class="btn btn--primary btn--small cat-add" @click="openAdd">
        <span class="material-symbols-outlined">add</span> Add
      </button>
    </PageHead>
    <p class="page-sub">Your own categories, next to the built-in ones.</p>

    <div v-if="settingsStore.customCategories.length" class="list">
      <div v-for="cat in settingsStore.customCategories" :key="cat.name" class="row cat-row">
        <span class="row__icon material-symbols-outlined">{{ cat.icon || 'category' }}</span>
        <span class="row__main">
          <span class="row__title">{{ cat.name }}</span>
          <span class="row__meta">{{ typeLabel(cat.type) }}</span>
        </span>
        <button class="icon-btn" :aria-label="`Edit ${cat.name}`" @click="openEdit(cat)">
          <span class="material-symbols-outlined">edit</span>
        </button>
        <button class="icon-btn cat-delete" :aria-label="`Delete ${cat.name}`" @click="deleteCategory(cat.name)">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </div>
    <p v-else class="empty">No categories of your own yet. Add one for anything the built-in list misses.</p>

    <BottomSheet v-model="showSheet" :title="editingOriginalName ? 'Edit category' : 'Add category'">
      <label class="field">
        <span class="field-label">Name</span>
        <input v-model="catName" type="text" class="field-input" placeholder="Gym" />
      </label>

      <div class="field">
        <p class="field-label">Icon</p>
        <div class="icon-grid">
          <button
            v-for="icon in iconOptions"
            :key="icon"
            class="icon-option"
            :class="{ on: catIcon === icon }"
            :aria-label="icon.replace(/_/g, ' ')"
            :aria-pressed="catIcon === icon"
            @click="catIcon = icon"
          >
            <span class="material-symbols-outlined">{{ icon }}</span>
          </button>
        </div>
      </div>

      <div class="field">
        <p class="field-label">Type</p>
        <div class="seg seg--block" role="group" aria-label="Type">
          <button v-for="t in types" :key="t.value" :aria-pressed="catType === t.value" @click="catType = t.value">{{ t.label }}</button>
        </div>
      </div>

      <button class="btn btn--primary btn--block" @click="editingOriginalName ? handleEditCategory() : handleAddCategory()">
        {{ editingOriginalName ? 'Save changes' : 'Add category' }}
      </button>
    </BottomSheet>
  </q-page>
</template>

<script setup>
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import BottomSheet from '../components/shared/BottomSheet.vue'
import PageHead from '../components/layout/PageHead.vue'
import { showToast } from '../utils/toast'

const settingsStore = useSettingsStore()

const iconOptions = [
  'category', 'shopping_bag', 'fitness_center', 'school', 'flight',
  'pets', 'child_care', 'sports_esports', 'movie', 'music_note',
  'local_cafe', 'home', 'build', 'medical_services', 'checkroom',
  'favorite', 'smartphone', 'local_bar', 'swap_horiz', 'redeem',
  'devices', 'beach_access', 'local_library', 'confirmation_number',
  'payments', 'credit_score', 'receipt_long', 'account_balance_wallet',
  'currency_exchange', 'schedule_send'
]

const types = [
  { value: 'one-time', label: 'One-time' },
  { value: 'recurring', label: 'Monthly' },
  { value: 'installment', label: 'Installment' }
]

const showSheet = ref(false)
const catName = ref('')
const catIcon = ref('category')
const catType = ref('one-time')
const editingOriginalName = ref(null)

function typeLabel(type) {
  return types.find(t => t.value === type)?.label || 'One-time'
}

function openAdd() {
  editingOriginalName.value = null
  catName.value = ''
  catIcon.value = 'category'
  catType.value = 'one-time'
  showSheet.value = true
}

function openEdit(cat) {
  editingOriginalName.value = cat.name
  catName.value = cat.name
  catIcon.value = cat.icon || 'category'
  catType.value = cat.type || 'one-time'
  showSheet.value = true
}

function handleAddCategory() {
  const name = catName.value.trim()
  if (!name) {
    showToast('Enter a category name', 'error')
    return
  }
  if (settingsStore.customCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('That category already exists', 'error')
    return
  }
  settingsStore.addCustomCategory({ name, icon: catIcon.value, color: null, type: catType.value })
  showSheet.value = false
  showToast(`Added ${name}`)
}

function handleEditCategory() {
  const name = catName.value.trim()
  if (!name) {
    showToast('Enter a category name', 'error')
    return
  }
  const original = editingOriginalName.value
  if (name.toLowerCase() !== original.toLowerCase() &&
      settingsStore.customCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('That category already exists', 'error')
    return
  }
  settingsStore.removeCustomCategory(original)
  settingsStore.addCustomCategory({ name, icon: catIcon.value, color: null, type: catType.value })
  showSheet.value = false
  showToast(`Updated ${name}`, 'edit')
}

function deleteCategory(name) {
  settingsStore.removeCustomCategory(name)
  showToast(`Removed ${name}`, 'delete')
}
</script>

<style lang="scss" scoped>
.cat-add { margin-right: 0; }

.cat-row {
  cursor: default;
  padding-right: 4px;
  &:active { background: none; }
}

.cat-delete { color: var(--muted); }

.icon-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
}

.icon-option {
  height: 44px;
  border-radius: var(--radius-control);
  border: 1px solid transparent;
  background: var(--raised);
  color: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &.on { background: var(--surface); border-color: var(--text); color: var(--text); }
}
</style>
