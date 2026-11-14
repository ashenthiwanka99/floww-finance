import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { capacitorStorage } from '../utils/capacitorStorage'

const MAX_TRASH_ITEMS = 50
const AUTO_PURGE_DAYS = 30

export const useTrashStore = defineStore('trash', () => {
  const items = ref([])

  // Add an item to trash
  // type: 'expense' | 'loan' | 'goal' | 'buyItem' | 'schedule'
  // payload: full object snapshot for restore
  function addToTrash(type, payload, label = '') {
    try {
      let safePayload
      try {
        safePayload = JSON.parse(JSON.stringify(payload))
      } catch (serErr) {
        console.error('[FLOWW] addToTrash serialize failed:', serErr?.message)
        return
      }
      items.value.unshift({
        id: uuidv4(),
        type,
        payload: safePayload,
        label: label || payload.name || 'Item',
        deletedAt: Date.now()
      })
      // Single pass: purge expired, then truncate to max size
      const cutoff = Date.now() - AUTO_PURGE_DAYS * 24 * 60 * 60 * 1000
      items.value = items.value
        .filter(i => i.deletedAt > cutoff)
        .slice(0, MAX_TRASH_ITEMS)
    } catch (err) {
      console.error('[FLOWW] addToTrash failed:', err?.message)
    }
  }

  function removeFromTrash(id) {
    items.value = items.value.filter(i => i.id !== id)
  }

  function clearAll() {
    items.value = []
  }

  function purgeExpired() {
    const cutoff = Date.now() - AUTO_PURGE_DAYS * 24 * 60 * 60 * 1000
    items.value = items.value.filter(i => i.deletedAt > cutoff)
  }

  const recentItems = computed(() =>
    [...items.value].sort((a, b) => b.deletedAt - a.deletedAt)
  )

  const count = computed(() => items.value.length)

  return {
    items,
    recentItems,
    count,
    addToTrash,
    removeFromTrash,
    clearAll,
    purgeExpired
  }
}, { persist: { storage: capacitorStorage } })
