<template>
  <q-page>
    <PageHead title="Backup and restore" back />
    <p class="page-sub num">{{ lastBackupLabel === 'Never' ? 'No backup saved yet' : `Last backup ${lastBackupLabel}` }}</p>

    <section class="section">
      <div class="section-head"><h2>Save a backup</h2></div>
      <div class="panel panel--pad">
        <p>One .json file with every expense, loan, card, friend and setting. Keep it in Drive or Files so it survives a new phone.</p>
        <button class="btn btn--primary btn--block backup-btn" :disabled="exporting" @click="handleExport">
          {{ exporting ? 'Saving…' : 'Save backup' }}
        </button>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Restore</h2></div>
      <div class="panel panel--pad">
        <p class="notice notice--warning">
          <span class="material-symbols-outlined">warning</span>
          <span>Restoring replaces everything on this phone with the backup. It cannot be undone.</span>
        </p>
        <button class="btn btn--outline btn--block backup-btn" :disabled="importing" @click="triggerFileInput">
          {{ importing ? 'Restoring…' : 'Choose backup file' }}
        </button>
        <input ref="fileInput" type="file" accept=".json" class="hidden-input" @change="handleFileSelect" />
      </div>
    </section>

    <BottomSheet v-model="showImportConfirm" title="Restore this backup?">
      <p>Everything on this phone is replaced with the backup. This cannot be undone.</p>
      <p v-if="pendingFileInfo" class="field-help num">Backup saved {{ pendingFileInfo }}</p>
      <div class="btn-row">
        <button class="btn btn--outline" @click="cancelImport">Cancel</button>
        <button class="btn btn--danger" @click="confirmImport">Replace my data</button>
      </div>
    </BottomSheet>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { exportAllData, importAllData } from '../utils/dataExport'
import BottomSheet from '../components/shared/BottomSheet.vue'
import { showToast } from '../utils/toast'
import { format } from 'date-fns'
import PageHead from '../components/layout/PageHead.vue'

// Last backup tracking
const lastBackupRaw = ref(localStorage.getItem('floww_last_backup'))

const lastBackupLabel = computed(() => {
  if (!lastBackupRaw.value) return 'Never'
  try {
    return format(new Date(lastBackupRaw.value), 'd MMM yyyy, HH:mm')
  } catch {
    return 'Never'
  }
})

// Export / Import loading states
const exporting = ref(false)
const importing = ref(false)

// Export
async function handleExport() {
  exporting.value = true
  try {
    const jsonString = exportAllData()
    const fileName = `floww-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`

    let fileUri = null
    let survivesUninstall = false

    try {
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) throw new Error('web')
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const targets = [
        { directory: Directory.Documents, persists: true },
        { directory: Directory.External, persists: false },
        { directory: Directory.Cache, persists: false }
      ]

      for (const target of targets) {
        try {
          await Filesystem.writeFile({
            path: fileName,
            data: jsonString,
            directory: target.directory,
            encoding: 'utf8'
          })
          const uriResult = await Filesystem.getUri({ path: fileName, directory: target.directory })
          fileUri = uriResult.uri
          survivesUninstall = target.persists
          break
        } catch {
          continue
        }
      }
    } catch {
      fileUri = null
    }

    if (fileUri) {
      try {
        const { Share } = await import('@capacitor/share')
        await Share.share({
          title: 'FLOWW Backup',
          text: 'FLOWW App Data Backup',
          url: fileUri,
          dialogTitle: 'Save a copy of your backup'
        })
      } catch {}
      showToast(
        survivesUninstall
          ? `Saved to Documents as ${fileName}`
          : 'Backup made, but only inside the app. Share it to Drive or Files or it goes when you uninstall.',
        survivesUninstall ? 'success' : 'info'
      )
    } else {
      try {
        await navigator.clipboard.writeText(jsonString)
        showToast('Backup copied to clipboard', 'success')
      } catch {
        const blob = new Blob([jsonString], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        showToast('Backup file downloaded', 'success')
      }
    }

    const now = new Date().toISOString()
    localStorage.setItem('floww_last_backup', now)
    lastBackupRaw.value = now
  } catch (err) {
    showToast('Export failed: ' + (err.message || 'Unknown error'), 'error')
  } finally {
    exporting.value = false
  }
}

// Import
const fileInput = ref(null)
const showImportConfirm = ref(false)
const pendingJsonString = ref(null)
const pendingFileInfo = ref(null)

function triggerFileInput() {
  fileInput.value?.click()
}

function handleFileSelect(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const jsonString = e.target.result
      const data = JSON.parse(jsonString)

      if (!data.version || !data.appName || data.appName !== 'FLOWW') {
        showToast('Invalid backup file', 'error')
        return
      }

      pendingJsonString.value = jsonString
      pendingFileInfo.value = data.exportedAt
        ? format(new Date(data.exportedAt), 'd MMM yyyy, HH:mm')
        : 'Unknown date'
      showImportConfirm.value = true
    } catch {
      showToast('Could not read backup file', 'error')
    }
  }
  reader.readAsText(file)

  // Reset so same file can be re-selected
  event.target.value = ''
}

function cancelImport() {
  showImportConfirm.value = false
  pendingJsonString.value = null
  pendingFileInfo.value = null
}

function confirmImport() {
  importing.value = true
  try {
    const counts = importAllData(pendingJsonString.value)
    showToast(
      `Restored ${counts.expenses} expenses, ${counts.loans} loans, ${counts.goals} goals, ${counts.items} items`,
      'success'
    )
  } catch (err) {
    showToast('Import failed: ' + (err.message || 'Unknown error'), 'error')
  } finally {
    importing.value = false
    showImportConfirm.value = false
    pendingJsonString.value = null
    pendingFileInfo.value = null
  }
}
</script>

<style lang="scss" scoped>
.backup-btn { margin-top: 16px; }
.hidden-input { display: none; }
</style>
