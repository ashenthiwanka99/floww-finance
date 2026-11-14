import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { capacitorStorage } from '../utils/capacitorStorage'
import { registerLearnedCategoryGetter, normalizeMerchant } from '../utils/smsParser'

export const useSmsImportStore = defineStore('smsImport', () => {
  // Set of fingerprints already imported (so we don't double-add)
  const importedFingerprints = ref([])
  // Edited-but-not-imported transactions, keyed by fingerprint
  // { [fingerprint]: { name, amount, category, dueDate, status, paidFromCash, notes, icon, iconColor } }
  const pendingEdits = ref({})
  // Learned merchant → category overrides. Keys are normalized merchant
  // strings (see smsParser.normalizeMerchant). Wins over static rules during
  // future imports.
  const merchantCategoryMap = ref({})
  const dismissedFingerprints = ref([])
  // Settings
  const scanRangeDays = ref(30)
  const permissionGranted = ref(false)

  function isImported(fp) {
    return importedFingerprints.value.includes(fp)
  }

  function markImported(fp) {
    if (!fp) return
    if (!importedFingerprints.value.includes(fp)) {
      importedFingerprints.value.push(fp)
    }
    // Cap at 10k entries — far above any realistic SMS history. The original
    // 500 cap was small enough that long-term users would lose dedup state and
    // see old SMS reappear as new on a rescan.
    if (importedFingerprints.value.length > 10000) {
      importedFingerprints.value = importedFingerprints.value.slice(-10000)
    }
  }

  function markImportedBatch(fps) {
    (fps || []).forEach(markImported)
  }

  function isDismissed(fp) {
    return dismissedFingerprints.value.includes(fp)
  }

  function dismiss(fp) {
    if (!fp || dismissedFingerprints.value.includes(fp)) return
    dismissedFingerprints.value = [...dismissedFingerprints.value, fp].slice(-2000)
  }

  function undismiss(fp) {
    dismissedFingerprints.value = dismissedFingerprints.value.filter(x => x !== fp)
  }

  function clearHistory() {
    importedFingerprints.value = []
  }

  // ── Pending edits ──
  function savePendingEdit(fp, edit) {
    if (!fp || !edit) return
    pendingEdits.value = { ...pendingEdits.value, [fp]: edit }
  }

  function getPendingEdit(fp) {
    return pendingEdits.value[fp] || null
  }

  function clearPendingEdit(fp) {
    if (!fp || !pendingEdits.value[fp]) return
    const next = { ...pendingEdits.value }
    delete next[fp]
    pendingEdits.value = next
  }

  function hasPendingEdit(fp) {
    return !!pendingEdits.value[fp]
  }

  function clearAllPendingEdits() {
    pendingEdits.value = {}
  }

  // ── Layer 2: learned merchant → category ──
  function learnMerchantCategory(merchant, category) {
    if (!merchant || !category) return
    const key = normalizeMerchant(merchant)
    if (!key) return
    if (merchantCategoryMap.value[key] === category) return
    merchantCategoryMap.value = { ...merchantCategoryMap.value, [key]: category }
  }

  function getLearnedCategory(normalizedKey) {
    return merchantCategoryMap.value[normalizedKey] || null
  }

  function forgetMerchant(normalizedKey) {
    if (!normalizedKey || !merchantCategoryMap.value[normalizedKey]) return
    const next = { ...merchantCategoryMap.value }
    delete next[normalizedKey]
    merchantCategoryMap.value = next
  }

  function clearLearnedMerchants() {
    merchantCategoryMap.value = {}
  }

  // Register lookup with the parser so detectCategory can consult learned
  // overrides without a circular import.
  registerLearnedCategoryGetter(getLearnedCategory)

  const importedCount = computed(() => importedFingerprints.value.length)
  const pendingEditsCount = computed(() => Object.keys(pendingEdits.value).length)
  const learnedMerchantCount = computed(() => Object.keys(merchantCategoryMap.value).length)

  return {
    importedFingerprints,
    pendingEdits,
    merchantCategoryMap,
    dismissedFingerprints,
    isDismissed,
    dismiss,
    undismiss,
    scanRangeDays,
    permissionGranted,
    isImported,
    markImported,
    markImportedBatch,
    clearHistory,
    savePendingEdit,
    getPendingEdit,
    clearPendingEdit,
    hasPendingEdit,
    clearAllPendingEdits,
    learnMerchantCategory,
    getLearnedCategory,
    forgetMerchant,
    clearLearnedMerchants,
    importedCount,
    pendingEditsCount,
    learnedMerchantCount
  }
}, { persist: { storage: capacitorStorage } })
