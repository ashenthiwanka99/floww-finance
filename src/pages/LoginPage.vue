<template>
  <div class="auth">
    <div class="signin-overlay" :class="{ 'signin-overlay--active': signingIn }" aria-live="polite">
      <img src="/floww-mark.svg" alt="" width="40" height="40" />
      <p class="signin-overlay__text">Signing you in…</p>
    </div>

    <div class="auth__brand">
      <img src="/floww-mark.svg" alt="" width="40" height="40" />
      <p class="auth__name">Floww</p>
    </div>
    <h1>Sign in</h1>
    <p class="page-sub">Track your salary cycle, bills and spending in LKR.</p>

    <button class="btn btn--outline btn--block" :disabled="loading || signingIn" @click="handleGoogleSignIn">
      {{ loading ? 'Connecting…' : 'Continue with Google' }}
    </button>

    <p class="auth__or">or with email</p>

    <form novalidate @submit.prevent="handleEmailSignIn">
      <div class="field">
        <label class="field-label" for="login-email">Email</label>
        <input id="login-email" v-model="email" type="email" autocomplete="email" class="field-input" :class="{ 'field-error': fieldErrors.email }" :aria-describedby="fieldErrors.email ? 'login-email-err' : undefined" @input="clearError('email')" />
        <p v-if="fieldErrors.email" id="login-email-err" class="field-error-msg">{{ fieldErrors.email }}</p>
      </div>
      <div class="field">
        <label class="field-label" for="login-password">Password</label>
        <div class="input-with-clear">
          <input id="login-password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" class="field-input" :class="{ 'field-error': fieldErrors.password }" :aria-describedby="fieldErrors.password ? 'login-password-err' : undefined" @input="clearError('password')" />
          <button type="button" class="field-clear" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
            <span class="material-symbols-outlined">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
          </button>
        </div>
        <p v-if="fieldErrors.password" id="login-password-err" class="field-error-msg">{{ fieldErrors.password }}</p>
      </div>

      <p v-if="authError" class="field-error-msg" role="alert">{{ authError }}</p>

      <button type="submit" class="btn btn--primary btn--block auth__submit" :disabled="!email || !password || loading">
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <p class="auth__switch">
      No account yet? <router-link to="/signup">Create one</router-link>
    </p>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useCloudSync } from '../composables/useCloudSync'
import { useSettingsStore } from '../stores/settingsStore'
import { showToast } from '../utils/toast'

const router = useRouter()
const { signIn, signInWithGoogle, authError, currentUser } = useAuth()
const { downloadFromCloud, startAutoSync } = useCloudSync()
const settingsStore = useSettingsStore()

const email = ref('')
const password = ref('')
const loading = ref(false)
const showPassword = ref(false)
const signingIn = ref(false)

const fieldErrors = reactive({})

function clearError(field) { delete fieldErrors[field] }

async function handlePostLogin() {
  // Cloud sync (non-blocking)
  try {
    if (currentUser.value) {
      await downloadFromCloud()
      startAutoSync()
    }
  } catch {}

  // Pre-fill profile (non-blocking)
  try {
    if (currentUser.value) {
      settingsStore.authMethod = currentUser.value.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'email'
      if (!settingsStore.userName && currentUser.value.displayName) {
        settingsStore.userName = currentUser.value.displayName
      }
      if (!settingsStore.profileImage && currentUser.value.photoURL) {
        try {
          const res = await fetch(currentUser.value.photoURL)
          if (res.ok) {
            const blob = await res.blob()
            const b64 = await new Promise((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result)
              reader.onerror = () => resolve(null)
              reader.readAsDataURL(blob)
            })
            if (b64) settingsStore.profileImage = b64
          }
        } catch {
          // Don't store raw URL — it won't work in Capacitor WebView
        }
      }
    }
  } catch {}

  // Navigate (always happens)
  if (!settingsStore.onboardingComplete) {
    router.replace('/onboarding')
  } else {
    router.replace('/')
  }
}

async function handleGoogleSignIn() {
  loading.value = true
  try {
    await signInWithGoogle()
    signingIn.value = true
    // Force Vue to re-render — setTimeout is more reliable than rAF on Capacitor WebView
    await new Promise(r => setTimeout(r, 300))
    await handlePostLogin()
  } catch (err) {
    signingIn.value = false
    loading.value = false
    showToast(err?.message || 'Sign-in failed', 'error')
  }
}

async function handleEmailSignIn() {
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!email.value?.trim()) fieldErrors.email = 'Email is required'
  if (!password.value) fieldErrors.password = 'Password is required'
  if (Object.keys(fieldErrors).length > 0) return
  loading.value = true
  try {
    await signIn(email.value, password.value)
    signingIn.value = true
    await new Promise(r => setTimeout(r, 300))
    await handlePostLogin()
  } catch (err) {
    signingIn.value = false
    loading.value = false
    showToast(err?.message || 'Sign-in failed', 'error')
  }
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

.auth__or { text-align: center; color: var(--muted); margin: 20px 0; }
.auth__submit { margin-top: 8px; }
.auth__switch { margin-top: 24px; text-align: center; color: var(--muted); a { color: var(--text); font-weight: 500; } }

.signin-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: var(--ground);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  &--active { opacity: 1; pointer-events: auto; }
}

.signin-overlay__text { font-size: var(--fs-section); font-weight: 500; }
</style>
