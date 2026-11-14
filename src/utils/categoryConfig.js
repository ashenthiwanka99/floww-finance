/**
 * Single source of truth for category icons and colors.
 * Import this everywhere instead of duplicating mappings.
 */

export const categoryIcons = {
  bills:          { icon: 'receipt_long',      color: '#C0C1FF' },
  groceries:      { icon: 'shopping_basket',   color: '#00F5C4' },
  dining:         { icon: 'restaurant',        color: '#EBC236' },
  subscriptions:  { icon: 'subscriptions',     color: '#FFB4AB' },
  installments:   { icon: 'calendar_month',    color: '#C0C1FF' },
  creditCards:    { icon: 'credit_card',       color: '#C0C1FF' },
  loans:          { icon: 'account_balance',   color: '#C0C1FF' },
  transport:      { icon: 'directions_car',    color: '#EBC236' },
  personalCare:   { icon: 'spa',               color: '#EBC236' },
  healthcare:     { icon: 'health_and_safety', color: '#00F5C4' },
  scheduled:      { icon: 'schedule',          color: '#EBC236' },
  others:         { icon: 'more_horiz',        color: '#B9CAC2' },
  lend:           { icon: 'handshake',         color: '#C0C1FF' },
  fuel:           { icon: 'local_gas_station', color: '#F59E0B' },
  savings:        { icon: 'savings',           color: '#EBC236' },
  cashWithdrawal: { icon: 'local_atm',         color: '#00F5C4' },
  onlineTransfer: { icon: 'swap_horiz',        color: '#C0C1FF' }
}

/**
 * Registry for custom categories — populated by settingsStore after Pinia initializes.
 * This avoids circular deps and require() in Vite.
 */
let _customCatsGetter = null

export function registerCustomCategoriesGetter(getter) {
  _customCatsGetter = getter
}

function getCustomCats() {
  return _customCatsGetter ? _customCatsGetter() : []
}

/**
 * Get icon config for a category.
 * Checks built-in categories first, then custom categories.
 * Falls back to gray generic icon.
 */
export function getCategoryIcon(category, customCategories) {
  if (categoryIcons[category]) return categoryIcons[category]

  const customs = customCategories ?? getCustomCats()

  const custom = customs.find(c => (c.name || c) === category)
  if (custom && typeof custom === 'object') {
    return {
      icon: custom.icon || 'category',
      color: custom.color || '#B9CAC2'
    }
  }

  return { icon: 'category', color: '#B9CAC2' }
}

/**
 * Get chart color for a category (full opacity).
 */
export function getCategoryColor(category, customCategories) {
  return getCategoryIcon(category, customCategories).color
}

/**
 * Default categories list.
 */
export const defaultCategories = [
  'bills', 'groceries', 'dining', 'subscriptions', 'installments',
  'creditCards', 'loans', 'transport', 'fuel', 'personalCare', 'healthcare',
  'scheduled', 'others', 'lend', 'savings', 'cashWithdrawal', 'onlineTransfer'
]

const categoryLabels = {
  bills: 'Bills',
  groceries: 'Groceries',
  dining: 'Dining',
  subscriptions: 'Subscriptions',
  installments: 'Installments',
  creditCards: 'Credit cards',
  creditCardPayment: 'Card payment',
  loans: 'Loan EMI',
  transport: 'Transport',
  personalCare: 'Personal care',
  healthcare: 'Healthcare',
  scheduled: 'Scheduled',
  others: 'Other',
  lend: 'Lent',
  fuel: 'Fuel',
  savings: 'Savings',
  cashWithdrawal: 'Cash withdrawal',
  onlineTransfer: 'Transfer'
}

export function categoryLabel(category) {
  if (!category) return 'Other'
  return categoryLabels[category] || String(category).replace(/^./, c => c.toUpperCase())
}
