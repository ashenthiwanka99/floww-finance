<template>
  <div class="auth">
    <div class="auth__brand">
      <img src="/floww-mark.svg" alt="" width="40" height="40" />
      <p class="auth__name">Floww</p>
    </div>
    <h1>Create an account</h1>
    <p class="page-sub">Your data syncs to the cloud, so a new phone picks up where you left off.</p>

    <button class="btn btn--outline btn--block" :disabled="loading" @click="handleGoogleSignIn">Continue with Google</button>

    <p class="auth__or">or with email</p>

    <form novalidate @submit.prevent="handleEmailSignUp">
      <div class="field">
        <label class="field-label" for="su-name">Name</label>
        <input id="su-name" v-model="fullName" type="text" autocomplete="name" class="field-input" :class="{ 'field-error': fieldErrors.name }" :aria-describedby="fieldErrors.name ? 'su-name-err' : undefined" @input="clearError('name')" />
        <p v-if="fieldErrors.name" id="su-name-err" class="field-error-msg">{{ fieldErrors.name }}</p>
      </div>
      <div class="field">
        <label class="field-label" for="su-email">Email</label>
        <input id="su-email" v-model="email" type="email" autocomplete="email" class="field-input" :class="{ 'field-error': fieldErrors.email }" :aria-describedby="fieldErrors.email ? 'su-email-err' : undefined" @input="clearError('email')" />
        <p v-if="fieldErrors.email" id="su-email-err" class="field-error-msg">{{ fieldErrors.email }}</p>
      </div>
      <div class="field">
        <label class="field-label" for="su-password">Password</label>
        <div class="input-with-clear">
          <input id="su-password" v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" class="field-input" :class="{ 'field-error': fieldErrors.password }" aria-describedby="su-password-help" @input="clearError('password')" />
          <button type="button" class="field-clear" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
            <span class="material-symbols-outlined">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
          </button>
        </div>
        <p v-if="fieldErrors.password" id="su-password-help" class="field-error-msg">{{ fieldErrors.password }}</p>
        <p v-else id="su-password-help" class="field-help">At least 6 characters.</p>
      </div>
      <div class="field">
        <label class="field-label" for="su-confirm">Confirm password</label>
        <div class="input-with-clear">
          <input id="su-confirm" v-model="confirmPassword" :type="showConfirm ? 'text' : 'password'" autocomplete="new-password" class="field-input" :class="{ 'field-error': fieldErrors.confirmPassword }" :aria-describedby="fieldErrors.confirmPassword ? 'su-confirm-err' : undefined" @input="clearError('confirmPassword')" />
          <button type="button" class="field-clear" :aria-label="showConfirm ? 'Hide password' : 'Show password'" @click="showConfirm = !showConfirm">
            <span class="material-symbols-outlined">{{ showConfirm ? 'visibility_off' : 'visibility' }}</span>
          </button>
        </div>
        <p v-if="fieldErrors.confirmPassword" id="su-confirm-err" class="field-error-msg">{{ fieldErrors.confirmPassword }}</p>
      </div>

      <p v-if="localError || authError" class="field-error-msg" role="alert">{{ localError || authError }}</p>

      <button type="submit" class="btn btn--primary btn--block auth__submit" :disabled="!email || !password || !confirmPassword || loading">
        {{ loading ? 'Creating account…' : 'Create account' }}
      </button>
    </form>

    <p class="auth__switch">
      Already have an account? <router-link to="/login">Sign in</router-link>
    </p>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { updateProfile } from 'firebase/auth'
import { useAuth } from '../composables/useAuth'
import { useCloudSync } from '../composables/useCloudSync'
import { useSettingsStore } from '../stores/settingsStore'
import { showToast } from '../utils/toast'

const router = useRouter()
const { signUp, signInWithGoogle, authError } = useAuth()
const { syncNow, startAutoSync } = useCloudSync()
const settingsStore = useSettingsStore()

const fullName = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const localError = ref(null)
const showPassword = ref(false)
const showConfirm = ref(false)

const fieldErrors = reactive({})

function clearError(field) { delete fieldErrors[field] }

async function handlePostSignUp() {
  // Cloud sync (non-blocking)
  try {
    await syncNow()
    startAutoSync()
  } catch {}

  // Always go to onboarding for new signup
  router.replace('/onboarding')
}

async function handleGoogleSignIn() {
  loading.value = true
  localError.value = null
  try {
    await signInWithGoogle()
    settingsStore.authMethod = 'google'
    showToast('Signed in with Google')
    await handlePostSignUp()
  } catch (err) {
    showToast(err?.message || 'Sign-in failed', 'error')
  } finally {
    loading.value = false
  }
}

async function handleEmailSignUp() {
  localError.value = null
  Object.keys(fieldErrors).forEach(k => delete fieldErrors[k])
  if (!fullName.value?.trim()) fieldErrors.name = 'Name is required'
  if (!email.value?.trim()) fieldErrors.email = 'Email is required'
  if (!password.value || password.value.length < 6) fieldErrors.password = 'Use at least 6 characters'
  if (password.value !== confirmPassword.value) fieldErrors.confirmPassword = 'The two passwords do not match'
  if (Object.keys(fieldErrors).length > 0) return
  loading.value = true
  try {
    const user = await signUp(email.value, password.value)
    if (fullName.value.trim()) {
      await updateProfile(user, { displayName: fullName.value.trim() })
      settingsStore.userName = fullName.value.trim()
    }
    settingsStore.authMethod = 'email'
    showToast('Account created')
    await handlePostSignUp()
  } catch (err) {
    showToast(err?.message || 'Sign-up failed', 'error')
  } finally {
    loading.value = false
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
</style>
