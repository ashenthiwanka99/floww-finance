// JS wrapper for the native Android SmsInbox plugin.
// Gracefully degrades to a no-op on web/iOS.

import { Capacitor, registerPlugin } from '@capacitor/core'

const SmsInbox = registerPlugin('SmsInbox')

function isAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function checkSmsPermission() {
  if (!isAvailable()) return { granted: false, supported: false }
  try {
    const result = await SmsInbox.checkPermission()
    return { granted: !!result.granted, supported: true }
  } catch {
    return { granted: false, supported: true }
  }
}

export async function requestSmsPermission() {
  if (!isAvailable()) return { granted: false, supported: false }
  try {
    const result = await SmsInbox.requestPermission()
    return { granted: !!result.granted, supported: true }
  } catch {
    return { granted: false, supported: true }
  }
}

/**
 * Read SMS inbox.
 * @param {Object} opts
 * @param {string[]} [opts.senders] - Partial sender IDs to match (case-insensitive)
 * @param {number} [opts.sinceDays] - Only SMS within this many days
 * @param {number} [opts.limit] - Max messages (default 500)
 * @returns {Promise<{ messages: Array<{id, address, body, date}> }>}
 */
export async function readSmsInbox(opts = {}) {
  if (!isAvailable()) {
    return { messages: [], supported: false }
  }
  const sinceMs = opts.sinceDays
    ? Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000
    : 0
  try {
    const result = await SmsInbox.readInbox({
      senders: opts.senders || [],
      sinceMs,
      limit: opts.limit || 500
    })
    return { messages: result.messages || [], supported: true }
  } catch (err) {
    console.error('[SMS] readInbox failed:', err?.message || err)
    return { messages: [], supported: true, error: String(err?.message || err) }
  }
}

export { isAvailable as isSmsSupported }
