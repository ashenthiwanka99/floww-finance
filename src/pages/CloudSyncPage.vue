<template>
  <q-page>
    <PageHead title="Cloud sync" back />

    <template v-if="!currentUser">
      <p class="page-sub">Sign in to keep a copy of your data in the cloud and use it on another phone.</p>
      <p v-if="settingsStore.authMethod === 'guest'" class="notice">
        <span class="material-symbols-outlined">info</span>
        <span>You are using Floww as a guest, so nothing is synced yet.</span>
      </p>
      <div class="sync-actions">
        <button class="btn btn--primary btn--block" :disabled="googleLoading" @click="handleGoogleSignIn">
          {{ googleLoading ? 'Signing in…' : 'Continue with Google' }}
        </button>
        <p v-if="authError" class="field-error-msg" role="alert">{{ authError }}</p>
        <button class="btn btn--outline btn--block" @click="router.push('/login')">Sign in with email</button>
        <button class="btn btn--ghost btn--block" @click="router.push('/signup')">Create an account</button>
      </div>
    </template>

    <template v-else>
      <p class="page-sub">Signed in as {{ currentUser.email }}</p>

      <section class="section">
        <div class="section-head"><h2>Sync</h2></div>
        <div class="panel panel--pad">
          <div class="switch-row sync-switch">
            <div class="switch-row__text">
              <p class="switch-row__title">Sync automatically</p>
              <p class="switch-row__desc num">Last synced {{ lastSyncedLabel === 'Never' ? 'never' : lastSyncedLabel }}</p>
            </div>
            <button
              class="switch"
              role="switch"
              :aria-checked="autoSyncEnabled"
              aria-label="Sync automatically"
              @click="setAutoSync(!autoSyncEnabled)"
            />
          </div>
          <p v-if="syncError" class="notice notice--negative sync-error" role="alert">
            <span class="material-symbols-outlined">cloud_off</span>
            <span>Sync failed: {{ syncError }} <button :disabled="isSyncing" @click="handleRetry">{{ isSyncing ? 'Retrying…' : 'Retry' }}</button> <button @click="clearError">Dismiss</button></span>
          </p>
          <div class="btn-row">
            <button class="btn btn--primary" :disabled="isSyncing" @click="handleSyncNow">
              {{ isSyncing ? 'Syncing…' : 'Upload now' }}
            </button>
            <button class="btn btn--outline" :disabled="isSyncing" @click="handleDownload">Download</button>
          </div>
          <p class="field-help">Upload replaces the cloud copy with this phone's data. Download brings the cloud copy onto this phone.</p>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2>Account</h2></div>
        <div class="panel panel--pad">
          <p class="account-id num">Account ID {{ currentUser.uid.slice(0, 8) }}…</p>
          <button class="btn btn--danger btn--block" @click="handleSignOut">Sign out</button>
        </div>
      </section>
    </template>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useCloudSync } from '../composables/useCloudSync'
import { useSettingsStore } from '../stores/settingsStore'
import { showToast } from '../utils/toast'
import { format } from 'date-fns'
import PageHead from '../components/layout/PageHead.vue'

const router = useRouter()
const settingsStore = useSettingsStore()
const { currentUser, authError, signInWithGoogle, signOut } = useAuth()
const { lastSynced, isSyncing, syncError, autoSyncEnabled, syncNow, downloadFromCloud, startAutoSync, startRealtimeSync, stopRealtimeSync, setAutoSync, clearError } = useCloudSync()

const googleLoading = ref(false)

const lastSyncedLabel = computed(() => {
  if (!lastSynced.value) return 'Never'
  return format(new Date(lastSynced.value), 'd MMM yyyy, HH:mm')
})

async function handleGoogleSignIn() {
  googleLoading.value = true
  try {
    await signInWithGoogle()
    showToast('Signed in with Google')
    const hasData = await downloadFromCloud()
    if (hasData) showToast('Data downloaded from cloud')
    startAutoSync()
  } catch (err) {
    showToast(err?.message || 'Sign-in failed', 'error')
  } finally {
    googleLoading.value = false
  }
}

async function handleSignOut() {
  stopRealtimeSync()
  await signOut()
  settingsStore.authMethod = 'guest'
  showToast('Signed out', 'info')
  router.replace('/welcome')
}

async function handleSyncNow() {
  await syncNow()
  if (!syncError.value) showToast('Data uploaded to cloud')
}

async function handleDownload() {
  const hasData = await downloadFromCloud()
  if (hasData && !syncError.value) showToast('Data downloaded from cloud')
  else if (!hasData) showToast('No cloud data found', 'info')
}

async function handleRetry() {
  await syncNow()
  if (!syncError.value) showToast('Sync successful')
}
</script>

<style lang="scss" scoped>
.sync-actions { display: grid; gap: 8px; margin-top: 16px; }
.sync-switch { padding-top: 0; }
.sync-error { margin-top: 8px; }
.account-id { color: var(--muted); margin-bottom: 12px; }
</style>
