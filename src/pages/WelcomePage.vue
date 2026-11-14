<template>
  <div class="auth welcome">
    <img src="/floww-mark.svg" alt="" width="40" height="40" />
    <h1 class="welcome__name">Floww</h1>
    <p class="page-sub">Track your salary cycle, bills and spending in LKR.</p>

    <div class="welcome__actions">
      <button class="btn btn--primary btn--block" :disabled="loading" @click="handleGoogle">
        {{ loading ? 'Connecting…' : 'Continue with Google' }}
      </button>
      <button class="btn btn--outline btn--block" @click="$router.push('/login')">Sign in with email</button>
      <button class="btn btn--ghost btn--block" @click="$router.push('/signup')">Create an account</button>
      <button class="btn btn--ghost btn--block" @click="handleGuest">Continue as guest</button>
      <p class="field-help welcome__note">As a guest your data stays on this phone. You can link an account later.</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useCloudSync } from '../composables/useCloudSync'
import { useSettingsStore } from '../stores/settingsStore'
import { showToast } from '../utils/toast'

const router = useRouter()
const { signInWithGoogle } = useAuth()
const settingsStore = useSettingsStore()
const loading = ref(false)

async function handleGoogle() {
  loading.value = true
  try {
    const user = await signInWithGoogle()
    // Pre-fill from Google profile
    if (user?.displayName) settingsStore.userName = user.displayName
    // Google photo URL — ensure it loads with proper size
    const photo = user?.photoURL
    if (photo) {
      settingsStore.profileImage = photo.includes('?') ? photo : photo + '?sz=200'
    }
    settingsStore.authMethod = 'google'
    // Check for cloud data
    const { downloadFromCloud, startAutoSync } = useCloudSync()
    const hasData = await downloadFromCloud()
    if (hasData && settingsStore.onboardingComplete) {
      startAutoSync()
      router.replace('/')
    } else {
      router.replace('/onboarding')
    }
  } catch (err) {
    showToast(err?.message || 'Google sign-in failed', 'error')
  } finally {
    loading.value = false
  }
}

function handleGuest() {
  settingsStore.authMethod = 'guest'
  router.push('/onboarding')
}
</script>

<style lang="scss" scoped>
.auth {
  min-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: calc(48px + env(safe-area-inset-top, 0px)) var(--gutter) calc(24px + env(safe-area-inset-bottom, 0px));
}

.auth__brand { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
.auth__name { font-size: var(--fs-section); font-weight: 600; }

.auth h1 { font-size: var(--fs-title); line-height: 30px; font-weight: 600; }
.auth .page-sub { margin: 4px 0 24px; }

.welcome { justify-content: flex-end; }
.welcome__name { margin-top: 16px; }
.welcome__actions { display: grid; gap: 8px; margin-top: auto; padding-top: 32px; }
.welcome__note { text-align: center; }
</style>
