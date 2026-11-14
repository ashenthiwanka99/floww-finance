// PIN hashing helpers. The lock PIN must never be persisted in plain text —
// we store a PBKDF2-SHA256 hash + random salt instead, so a device backup /
// rooted SharedPreferences dump does not reveal the PIN.

const ITERATIONS = 120000

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomSalt() {
  const bytes = new Uint8Array(16)
  ;(globalThis.crypto || window.crypto).getRandomValues(bytes)
  return bufToHex(bytes.buffer)
}

// Returns a hex PBKDF2 hash of `pin` with `saltHex`. Falls back to a simple
// (still non-plaintext) digest if SubtleCrypto is unavailable.
export async function hashPin(pin, saltHex) {
  const subtle = (globalThis.crypto || window.crypto)?.subtle
  const enc = new TextEncoder()
  const saltBytes = Uint8Array.from(
    (saltHex.match(/.{1,2}/g) || []).map(h => parseInt(h, 16))
  )
  if (subtle?.importKey) {
    const keyMaterial = await subtle.importKey(
      'raw', enc.encode(String(pin)), { name: 'PBKDF2' }, false, ['deriveBits']
    )
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: saltBytes, iterations: ITERATIONS, hash: 'SHA-256' },
      keyMaterial,
      256
    )
    return bufToHex(bits)
  }
  // Fallback: SHA-256 of salt+pin (no SubtleCrypto.deriveBits).
  if (subtle?.digest) {
    const data = enc.encode(saltHex + ':' + String(pin))
    return bufToHex(await subtle.digest('SHA-256', data))
  }
  // Last-resort non-crypto digest — still avoids storing the raw PIN.
  let h = 5381
  const s = saltHex + ':' + String(pin)
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return 'fb' + h.toString(16)
}

// Constant-ish time string compare for hashes.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
