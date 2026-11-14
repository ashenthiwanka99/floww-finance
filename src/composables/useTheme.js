import { ref, watch } from 'vue'
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core'
import { useSettingsStore } from '../stores/settingsStore'

const StatusBar = registerPlugin('StatusBar')
const media = window.matchMedia?.('(prefers-color-scheme: dark)')
const systemDark = ref(!!media?.matches)

export function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode
  return systemDark.value ? 'dark' : 'light'
}

function apply(theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  try { localStorage.setItem('floww-theme', theme) } catch {}
  const ground = getComputedStyle(root).getPropertyValue('--ground').trim()
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ground)
  if (!Capacitor.isNativePlatform()) return
  SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {})
  StatusBar.setBackgroundColor({ color: ground }).catch(() => {})
}

export function initTheme() {
  const settings = useSettingsStore()
  media?.addEventListener('change', e => { systemDark.value = e.matches })
  window.addEventListener('flowwsystemtheme', e => { systemDark.value = !!e.dark })
  watch(() => resolveTheme(settings.themeMode), apply, { immediate: true })
}
