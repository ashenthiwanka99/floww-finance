<template>
  <Transition name="lock-fade">
    <div v-if="visible" class="lock" role="dialog" aria-label="Unlock Floww">
      <div class="lock__content">
        <img src="/floww-mark.svg" alt="" width="40" height="40" />
        <p class="lock__title">{{ subtitle }}</p>
        <p v-if="lockoutMsg" class="lock__error num" role="alert">{{ lockoutMsg }}</p>

        <div class="pin-dots" :class="{ 'pin-shake': shaking }" :aria-label="`${pin.length} of 4 digits entered`">
          <span
            v-for="i in 4"
            :key="i"
            class="pin-dot"
            :class="{ 'pin-dot--filled': pin.length >= i, 'pin-dot--error': hasError }"
          />
        </div>

        <div class="keypad">
          <template v-for="key in numpadKeys" :key="key.value || 'blank'">
            <button
              v-if="key.value === ''"
              class="key key--plain"
              :style="{ visibility: biometricAvailable && hasPin ? 'visible' : 'hidden' }"
              aria-label="Use fingerprint"
              @click="tryBiometric"
            >
              <span class="material-symbols-outlined">fingerprint</span>
            </button>
            <button
              v-else
              class="key num"
              :class="{ 'key--plain': key.value === 'del' }"
              :aria-label="key.value === 'del' ? 'Delete digit' : key.label"
              @click="handleKey(key.value)"
            >
              <span v-if="key.value === 'del'" class="material-symbols-outlined">backspace</span>
              <template v-else>{{ key.label }}</template>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useSettingsStore } from '../../stores/settingsStore'

const props = defineProps({
  visible: { type: Boolean, default: true }
})

const emit = defineEmits(['unlock'])
const settingsStore = useSettingsStore()

const pin = ref('')
const hasError = ref(false)
const shaking = ref(false)
const biometricAvailable = ref(false)

const hasPin = computed(() => settingsStore.hasLockPin())
const lockoutMsg = ref('')
let lockoutTimer = null

// If no PIN set yet, user needs to create one
const setupPhase = ref(!settingsStore.hasLockPin() ? 'create' : 'verify')

const subtitle = computed(() => {
  if (setupPhase.value === 'create') return 'Create a 4-digit PIN'
  if (setupPhase.value === 'confirm') return 'Confirm your PIN'
  return 'Enter PIN to unlock'
})

const numpadKeys = [
  { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' },
  { value: '4', label: '4' }, { value: '5', label: '5' }, { value: '6', label: '6' },
  { value: '7', label: '7' }, { value: '8', label: '8' }, { value: '9', label: '9' },
  { value: '', label: '' }, { value: '0', label: '0' }, { value: 'del', label: '' }
]

const firstPin = ref('')

function startLockoutCountdown() {
  if (lockoutTimer) clearInterval(lockoutTimer)
  const tick = () => {
    const ms = settingsStore.lockRemainingMs()
    if (ms <= 0) {
      lockoutMsg.value = ''
      if (lockoutTimer) { clearInterval(lockoutTimer); lockoutTimer = null }
      return
    }
    const s = Math.ceil(ms / 1000)
    const mm = Math.floor(s / 60)
    lockoutMsg.value = `Too many attempts. Try again in ${mm > 0 ? mm + 'm ' : ''}${s % 60}s`
  }
  tick()
  lockoutTimer = setInterval(tick, 1000)
}

const lockedOut = computed(() => settingsStore.lockRemainingMs() > 0)

async function handleKey(value) {
  if (value === '') return
  if (lockedOut.value) { startLockoutCountdown(); return }
  if (value === 'del') {
    pin.value = pin.value.slice(0, -1)
    hasError.value = false
    return
  }
  if (pin.value.length >= 4) return
  pin.value += value

  if (pin.value.length === 4) {
    if (setupPhase.value === 'create') {
      firstPin.value = pin.value
      pin.value = ''
      setupPhase.value = 'confirm'
    } else if (setupPhase.value === 'confirm') {
      if (pin.value === firstPin.value) {
        await settingsStore.setLockPin(pin.value)
        emit('unlock')
      } else {
        triggerError()
        setupPhase.value = 'create'
        firstPin.value = ''
      }
    } else {
      // Verify (hashed compare + brute-force throttle)
      const entered = pin.value
      const res = await settingsStore.verifyLockPin(entered)
      if (res.ok) {
        emit('unlock')
      } else {
        triggerError()
        if (res.lockedMs) startLockoutCountdown()
      }
    }
  }
}

function triggerError() {
  hasError.value = true
  shaking.value = true
  setTimeout(() => {
    shaking.value = false
    pin.value = ''
    hasError.value = false
  }, 500)
}

// Biometric
async function checkBiometric() {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return

    const { NativeBiometric } = await import('capacitor-native-biometric')
    const result = await NativeBiometric.isAvailable()
    biometricAvailable.value = result.isAvailable
  } catch (e) {
    biometricAvailable.value = false
  }
}

async function tryBiometric() {
  try {
    const { NativeBiometric } = await import('capacitor-native-biometric')
    await NativeBiometric.verifyIdentity({
      reason: 'Unlock Floww',
      title: 'Floww',
      subtitle: 'Use your fingerprint to unlock',
      useFallback: true,
      maxAttempts: 3
    })
    emit('unlock')
  } catch (e) {
    // Fall back to PIN — user is already on PIN screen
  }
}

// When lock screen becomes visible, check biometric and auto-trigger
watch(() => props.visible, async (val) => {
  if (val) {
    pin.value = ''
    hasError.value = false
    setupPhase.value = settingsStore.hasLockPin() ? 'verify' : 'create'

    if (settingsStore.lockRemainingMs() > 0) startLockoutCountdown()

    await checkBiometric()

    // Auto-trigger fingerprint if available and PIN already set
    if (biometricAvailable.value && settingsStore.hasLockPin()) {
      setTimeout(() => tryBiometric(), 300)
    }
  }
}, { immediate: true })

onUnmounted(() => {
  if (lockoutTimer) clearInterval(lockoutTimer)
})
</script>

<style lang="scss" scoped>
.lock {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: var(--ground);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px var(--gutter) calc(24px + env(safe-area-inset-bottom, 0px));
}

.lock__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 280px;
}

.lock__title {
  margin-top: 16px;
  font-size: var(--fs-section);
  line-height: 24px;
  font-weight: 500;
}

.lock__error {
  margin-top: 4px;
  font-size: var(--fs-body);
  color: var(--negative);
  text-align: center;
}

.pin-dots { display: flex; gap: 16px; margin: 24px 0 32px; }

.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--text);
  transition: background-color 0.1s ease;
  &--filled { background: var(--text); }
  &--error { border-color: var(--negative); background: var(--negative); }
}

.pin-shake { animation: shake 0.4s ease; }

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-8px); }
  40%, 80% { transform: translateX(8px); }
}

.keypad {
  display: grid;
  grid-template-columns: repeat(3, 64px);
  gap: 16px 24px;
}

.key {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 0;
  background: var(--raised);
  color: var(--text);
  font-size: 24px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.1s ease;

  &:active { background: var(--active); }
  &--plain { background: none; }
  .material-symbols-outlined { font-size: 26px; color: var(--muted); }
}

.lock-fade-leave-active { transition: opacity 0.2s ease; }
.lock-fade-leave-to { opacity: 0; }
</style>
