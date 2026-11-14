/**
 * Merge two arrays of objects by their `id` field.
 * - Items only in local → kept
 * - Items only in cloud → added
 * - Items in both → keep the one with newer updatedAt (or createdAt as fallback)
 *
 * @param {Array} localArr - Local array of objects with id field
 * @param {Array} cloudArr - Cloud array of objects with id field
 * @returns {Array} Merged array with no duplicates
 */
export function mergeArraysById(localArr, cloudArr) {
  const merged = new Map()

  // Add all local items first
  for (const item of (localArr || [])) {
    if (item.id) merged.set(item.id, item)
  }

  // Merge cloud items
  for (const item of (cloudArr || [])) {
    if (!item.id) continue
    const existing = merged.get(item.id)
    if (!existing) {
      // New item from cloud — add it
      merged.set(item.id, item)
    } else {
      // Exists in both — keep the one with newer timestamp.
      // If both sides are missing timestamps (legacy data) they tie at 0
      // and we prefer the LOCAL copy. This is a safer default than the old
      // behaviour where cloud silently won every tie — local edits made
      // before the timestamp era would otherwise be wiped on every sync.
      const cloudTime = item.updatedAt || item.createdAt || 0
      const localTime = existing.updatedAt || existing.createdAt || 0
      if (cloudTime > localTime) {
        merged.set(item.id, item)
      }
    }
  }

  return [...merged.values()]
}

/**
 * Merge monthly incomes — keyed by month string, keep newer entries.
 * @param {Object} localObj - Local monthlyIncomes { '2026-03': {...}, ... }
 * @param {Object} cloudObj - Cloud monthlyIncomes
 * @returns {Object} Merged object
 */
export function mergeMonthlyIncomes(localObj, cloudObj) {
  const merged = { ...(localObj || {}) }

  for (const [month, cloudData] of Object.entries(cloudObj || {})) {
    const localData = merged[month]
    if (!localData) {
      merged[month] = cloudData
    } else {
      // Prefer `_updatedAt` (set by setMonthlyIncome). Fall back to legacy
      // `date` field. If both sides tie at 0, prefer local — see mergeArraysById
      // for the same rationale.
      const cloudTime = cloudData._updatedAt || cloudData.date || 0
      const localTime = localData._updatedAt || localData.date || 0
      if (cloudTime > localTime) {
        merged[month] = cloudData
      }
    }
  }

  return merged
}

/**
 * Merge budget limits — uses `_updatedAt` on the limits object to resolve
 * conflicts. If neither side has a timestamp (legacy data) we prefer LOCAL
 * to avoid silent wipes on sync.
 * @param {Object} localLimits
 * @param {Object} cloudLimits
 * @returns {Object} Merged limits
 */
export function mergeBudgetLimits(localLimits, cloudLimits) {
  const local = localLimits || {}
  const cloud = cloudLimits || {}
  const localTime = local._updatedAt || 0
  const cloudTime = cloud._updatedAt || 0
  if (cloudTime > localTime) return { ...cloud }
  return { ...local }
}
