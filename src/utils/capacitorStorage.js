import { Preferences } from '@capacitor/preferences'
import { APP_VERSION } from './version'

// In-memory cache for sync reads
const cache = {}

// Store keys that Pinia uses. Any new persisted store MUST be added here
// or it won't survive an app restart (the cache preload skips it).
const STORE_KEYS = ['finance', 'settings', 'savings', 'buyList', 'predicted', 'smsImport', 'creditCards', 'accounts']
const RETIRED_KEYS = ['payOnBehalf']

/**
 * Record the running app version. A version change never deletes stored data:
 * the stores below are the user's records, not a cache.
 */
async function recordAppVersion() {
  const VERSION_KEY = 'floww_app_version'

  try {
    await Preferences.set({ key: VERSION_KEY, value: APP_VERSION })
  } catch {}

  try {
    localStorage.setItem(VERSION_KEY, APP_VERSION)
  } catch {}

  return false
}

/**
 * Pre-load all store data from Capacitor Preferences into memory cache.
 * Must be called BEFORE Pinia initializes (in capacitor boot file).
 * Also handles one-time migration from localStorage → Capacitor Preferences.
 */
export async function initStorage() {
  await recordAppVersion()

  for (const key of RETIRED_KEYS) {
    try { await Preferences.remove({ key }) } catch {}
    try { localStorage.removeItem(key) } catch {}
  }

  for (const key of STORE_KEYS) {
    try {
      const { value } = await Preferences.get({ key })
      if (value) {
        cache[key] = value
      } else {
        // One-time migration: copy from localStorage if exists
        const lsValue = localStorage.getItem(key)
        if (lsValue) {
          await Preferences.set({ key, value: lsValue })
          cache[key] = lsValue
          localStorage.removeItem(key)
        }
      }
    } catch (err) {
      // Fallback: try localStorage (browser dev mode)
      const lsValue = localStorage.getItem(key)
      if (lsValue) {
        cache[key] = lsValue
      }
    }
  }
}

/**
 * Sync storage adapter for pinia-plugin-persistedstate.
 * Reads from in-memory cache (instant, sync).
 * Writes to cache + Capacitor Preferences (async, fire-and-forget).
 */
export const capacitorStorage = {
  getItem(key) {
    return cache[key] ?? null
  },

  setItem(key, value) {
    cache[key] = value
    Preferences.set({ key, value }).then(() => {
      // Trigger widget update after data is persisted to SharedPreferences
      if (key === 'finance' || key === 'accounts') {
        import('../composables/useWidget').then(mod => {
          mod.useWidget().updateWidget()
        }).catch(err => console.warn('[FLOWW] Widget update failed:', err))
      }
    }).catch(err =>
      console.warn('[FLOWW] Preferences.set failed:', key, err)
    )
  },

  removeItem(key) {
    delete cache[key]
    Preferences.remove({ key }).catch(err =>
      console.warn('[FLOWW] Preferences.remove failed:', key, err)
    )
  }
}
