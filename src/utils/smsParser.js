// SMS Parser for Sri Lankan banks (COMBANK, NationsSMS)
// Returns a normalized transaction object or null if no match.

const SENDER_MAP = {
  COMBANK: 'Commercial Bank',
  COMBNK: 'Commercial Bank',
  NationsSMS: 'Nations Trust Bank',
  NTB: 'Nations Trust Bank'
}

function parseAmount(str) {
  if (!str) return null
  const cleaned = String(str).replace(/,/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// ──────────────────────────────────────────────
// Merchant normalization
// ──────────────────────────────────────────────

// Common Sri Lankan locations/branches that appear in card-purchase merchants.
// Stripping these makes "KEELLS PEPPERS NUGEGODA" → "KEELLS PEPPERS" → "KEELLS"
const SL_LOCATIONS = new RegExp([
  'COLOMBO', 'KANDY', 'GALLE', 'NEGOMBO', 'MAHARAGAMA', 'NUGEGODA', 'KOLLUPITIYA',
  'WELLAWATTE', 'DEHIWALA', 'MOUNT LAVINIA', 'MT LAVINIA', 'BAMBALAPITIYA',
  'KOTTE', 'RAJAGIRIYA', 'BATTARAMULLA', 'MALABE', 'KADUWELA', 'KIRULAPONE',
  'PILIYANDALA', 'PANADURA', 'MORATUWA', 'KALUTARA', 'KURUNEGALA', 'JAFFNA',
  'ANURADHAPURA', 'POLONNARUWA', 'TRINCOMALEE', 'BATTICALOA', 'MATARA',
  'HAMBANTOTA', 'RATNAPURA', 'BADULLA', 'NUWARA ELIYA', 'GAMPAHA', 'KOTAHENA',
  'WATTALA', 'JA-ELA', 'JA ELA', 'KELANIYA', 'BORALESGAMUWA', 'NAWALA',
  'PEPPERS', 'CRESCAT', 'LIBERTY PLAZA', 'ODEL', 'ONE GALLE FACE',
  'WILACHCHIYA', 'ANGODA', 'HORANA', 'AVISSAWELLA', 'KIRIBATHGODA'
].join('|'), 'gi')

// Stop-words to drop after location strip (extra noise)
const NOISE_WORDS = /\b(BR|BRANCH|OUTLET|STORE|MART|SUPERMARKET|HYPER|HYPERMARKET|EXPRESS|LK|LTD|PVT|PVT\.LTD|PVT LTD|\(PVT\)|CO|COMPANY)\b/gi

function normalizeMerchant(raw) {
  if (!raw) return ''
  return String(raw)
    .toUpperCase()
    .replace(SL_LOCATIONS, '')
    .replace(NOISE_WORDS, '')
    .replace(/[#/]+\d+/g, '')        // strip POS/terminal ids like #12345 or /KIRULAPONE
    .replace(/\s+/g, ' ')
    .trim()
}

// Display-friendly merchant (preserves case, just trims junk suffix)
function cleanMerchant(raw) {
  if (!raw) return ''
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+LK\s*$/i, '')
    .replace(/\.$/, '')
    .trim()
}

// ──────────────────────────────────────────────
// Category rules (Layer 1)
//
// Each rule has:
//   - patterns: array of regex; if ANY matches, the rule fires
//   - category: target category from categoryConfig.js
//   - confidence: 'high' | 'medium' | 'low' (used when picking among ties)
//   - priority: integer; higher wins on multi-match. Specific patterns (single
//     well-known merchant) score higher than generic keywords.
//
// Patterns are tested against the *normalized* merchant + transactionType
// concatenation, case-insensitive.
// ──────────────────────────────────────────────

const CATEGORY_RULES = [
  // ── Fees & bank charges → bills ──
  {
    category: 'bills',
    confidence: 'high',
    priority: 100,
    patterns: [
      /\b(annual fee|card fee|joining fee|late payment|service charge|sms charge|stamp duty|over\s*limit|cash advance fee)\b/i
    ]
  },
  // ── EMI / loan installments ──
  {
    category: 'installments',
    confidence: 'high',
    priority: 100,
    patterns: [
      /\b(emi|easy payment|instalment|installment|loan installment)\b/i
    ]
  },
  // ── Loan repayments (separate from EMIs but related) ──
  {
    category: 'loans',
    confidence: 'high',
    priority: 100,
    patterns: [
      /\b(loan repayment|loan settlement|loan disbursement|interest payment)\b/i
    ]
  },
  // ── Cash withdrawal ──
  {
    category: 'cashWithdrawal',
    confidence: 'high',
    priority: 95,
    patterns: [
      /\bwithdrawal\b/i,
      /\batm\b/i,
      /\bpeoples bank\b/i,
      /\bcash withdrawal\b/i
    ]
  },
  // ── Fuel ──
  {
    category: 'fuel',
    confidence: 'high',
    priority: 90,
    patterns: [
      /\b(shell|lanka ioc|ceypetco|laughfs petrol|laughfs gas|petrol|fuel station|gas station|sinopec)\b/i,
      /\blanka filling\b/i,
      /\bfuel surcharge\b/i
    ]
  },
  // ── Groceries / supermarkets ──
  {
    category: 'groceries',
    confidence: 'high',
    priority: 90,
    patterns: [
      /\b(keells|cargills|food city|glomark|arpico|laugfs mart|sathosa|kee aru|spar|lulu|king fisher|fresh.market)\b/i,
      /\bsupermarket\b/i,
      /\bhypermarket\b/i
    ]
  },
  // ── Dining / restaurants ──
  {
    category: 'dining',
    confidence: 'high',
    priority: 88,
    patterns: [
      /\b(pizza hut|dominos|burger king|kfc|mcdonalds|subway|wendys|buhari|barista|java lounge|hilton|cinnamon|galle face hotel|shangri.la|kingsbury|movenpick|taj samudra)\b/i,
      /\b(uber.eats|pickme food|menu lk|kapruka eats|food delivery)\b/i,
      /\b(restaurant|cafe|bistro|bakery|eatery)\b/i
    ]
  },
  // ── Transport / ride-share ──
  {
    category: 'transport',
    confidence: 'high',
    priority: 88,
    patterns: [
      /\b(pickme|uber(?!\s*eats)|taxi|kanga|kangaroo cabs|ride|cab)\b/i,
      /\b(rapid pass|highway|expressway toll)\b/i
    ]
  },
  // ── Telecom carriers → Telecom (custom category, user owns it) ──
  // Higher priority than the general bills rule so an Airtel reload doesn't
  // get bucketed as a utility bill.
  {
    category: 'Telecom',
    confidence: 'high',
    priority: 92,
    patterns: [
      /\b(dialog|mobitel|airtel|slt|hutch|bell|lankacom|telecom)\b/i
    ]
  },
  // ── Utilities / insurance → bills ──
  {
    category: 'bills',
    confidence: 'high',
    priority: 85,
    patterns: [
      /\b(ceb|ceylon electricity|leco|nwsdb|water board|national water)\b/i,
      /\b(insurance premium|allianz|aia|ceylinco|sri lanka insurance|softlogic insurance|union assurance)\b/i
    ]
  },
  // ── Subscriptions ──
  {
    category: 'subscriptions',
    confidence: 'high',
    priority: 85,
    patterns: [
      /\b(netflix|spotify|youtube premium|disney|amazon prime|apple\.com|apple\.com\/bill|icloud|google\s+(?:one|cloud|workspace)|chatgpt|openai|claude|anthropic|xbox|playstation|nintendo|steam|adobe|microsoft 365|office 365|notion|github)\b/i,
      /\bsubscription\b/i
    ]
  },
  // ── Healthcare ──
  {
    category: 'healthcare',
    confidence: 'high',
    priority: 85,
    patterns: [
      /\b(pharmacy|hospital|medical|healthguard|union chemists|lanka hospitals|asiri|nawaloka|durdans|hemas hospitals)\b/i,
      /\b(channeling|doctor|clinic|laboratory)\b/i
    ]
  },
  // ── Personal care ──
  {
    category: 'personalCare',
    confidence: 'medium',
    priority: 80,
    patterns: [
      /\b(salon|spa|barber|nail|grooming|beauty)\b/i
    ]
  },
  // ── Credit card payments ──
  {
    category: 'creditCards',
    confidence: 'high',
    priority: 90,
    patterns: [
      /\b(credit card payment|card settlement|credit card bill)\b/i
    ]
  },
  // ── Savings ──
  {
    category: 'savings',
    confidence: 'medium',
    priority: 75,
    patterns: [
      /\b(fixed deposit|savings deposit|sweep to savings)\b/i
    ]
  },
  // ── Specific brand → dining (caught before the generic fallback) ──
  {
    category: 'dining',
    confidence: 'high',
    priority: 89,
    patterns: [
      /\bsunisa(?:\s+takeaway)?\b/i,
      /\b(perera\s*&\s*sons|crepe runner|bubble me|flavory|caravan fresh|clover restaurant|nasigoraan|nasigooran|street burger|dons restaurant|weerasiri bakers)\b/i
    ]
  },
  // ── Soft-dining keyword fallback (lower priority — caught after specific brands) ──
  {
    category: 'dining',
    confidence: 'medium',
    priority: 60,
    patterns: [
      /\b(pizza|burger|fried chicken|noodles|kottu|hoppers|rice and curry)\b/i
    ]
  },
  // ── Online / foreign card POS → Online (custom category) ──
  {
    category: 'Online',
    confidence: 'high',
    priority: 82,
    patterns: [
      /\b(paypal|stripe|payhere|webxpay)\b/i,
      /\bforeign\s*pos\b/i,
      /\bcard\s+foreign\b/i
    ]
  },
  // ── E-commerce marketplaces → others (medium confidence, varied use) ──
  {
    category: 'others',
    confidence: 'medium',
    priority: 50,
    patterns: [
      /\b(daraz|amazon|aliexpress|ebay|kapruka|wow lk|takas|laafa)\b/i
    ]
  },
  // ── Bank-to-bank transfers (CEFTS, "Other Bank Transfer") → Online Transfer ──
  // Catches NTB's "Other Bank Transfer (CEFTS) was performed on your A/C..." SMS
  // shape. Highest in the transfer family so it beats the generic CEFTS-→-others
  // fallback below.
  {
    category: 'onlineTransfer',
    confidence: 'high',
    priority: 92,
    patterns: [
      /\b(other\s+)?bank\s+transfer\b/i,
      /\bcefts\b/i
    ]
  },
  // ── BNPL / instalment platforms (Mintpay, Koko) → custom user categories ──
  {
    category: 'Mintpay',
    confidence: 'high',
    priority: 86,
    patterns: [
      /\bmintpay\b/i
    ]
  },
  {
    category: 'Koko',
    confidence: 'high',
    priority: 86,
    patterns: [
      /\bkoko\b/i
    ]
  }
]

// (Previous person-name heuristic that auto-tagged 2-4 all-caps token
// merchants as `lend` was removed — too many legitimate merchants come
// through SMS as plain ALL-CAPS strings, and the false positives were
// flooding the dashboard with handshake icons. Unknown merchants now
// fall through to `others` and the user re-categorises as needed.)

// ──────────────────────────────────────────────
// Learned-overrides registry (Layer 2)
//
// smsImportStore registers a getter so we can look up the user's saved
// merchant→category mapping without a circular import.
// ──────────────────────────────────────────────
let _learnedGetter = null
export function registerLearnedCategoryGetter(getter) {
  _learnedGetter = getter
}
function getLearnedCategory(normalized) {
  if (!_learnedGetter || !normalized) return null
  try {
    return _learnedGetter(normalized) || null
  } catch {
    return null
  }
}

// Returns { category, confidence } — never null. Falls back to others/low.
function detectCategory(merchant, transactionType = '') {
  const normalized = normalizeMerchant(merchant)

  // Layer 2: user's learned mapping wins outright. High confidence.
  const learned = getLearnedCategory(normalized)
  if (learned) return { category: learned, confidence: 'high', source: 'learned' }

  // Layer 1: score against static rules
  const haystack = `${transactionType} ${normalized}`.trim()
  let best = null
  for (const rule of CATEGORY_RULES) {
    for (const re of rule.patterns) {
      if (re.test(haystack)) {
        if (!best || rule.priority > best.priority) {
          best = rule
        }
        break  // one match per rule is enough — move to next rule
      }
    }
  }
  if (best) return { category: best.category, confidence: best.confidence, source: 'rule' }

  // No rule matched — fall back to `others` (the lend heuristic was retired).
  return { category: 'others', confidence: 'low', source: 'fallback' }
}

// ──────────────────────────────────────────────
// Category icon + color (matches categoryConfig.js)
// ──────────────────────────────────────────────
function categoryMeta(cat) {
  const map = {
    bills:          { icon: 'receipt_long',      color: '#C0C1FF' },
    groceries:      { icon: 'shopping_basket',   color: '#00F5C4' },
    dining:         { icon: 'restaurant',        color: '#EBC236' },
    subscriptions:  { icon: 'subscriptions',     color: '#FFB4AB' },
    installments:   { icon: 'calendar_month',    color: '#C0C1FF' },
    creditCards:    { icon: 'credit_card',       color: '#C0C1FF' },
    loans:          { icon: 'account_balance',   color: '#C0C1FF' },
    transport:      { icon: 'directions_car',    color: '#EBC236' },
    fuel:           { icon: 'local_gas_station', color: '#F59E0B' },
    personalCare:   { icon: 'spa',               color: '#EBC236' },
    healthcare:     { icon: 'health_and_safety', color: '#00F5C4' },
    lend:           { icon: 'handshake',         color: '#C0C1FF' },
    savings:        { icon: 'savings',           color: '#EBC236' },
    cashWithdrawal: { icon: 'local_atm',         color: '#00F5C4' },
    onlineTransfer: { icon: 'swap_horiz',        color: '#C0C1FF' },
    income:         { icon: 'call_received',     color: '#00F5C4' },
    // Custom user-owned categories driven by SMS rules. If the user hasn't
    // created the matching custom category yet, the dashboard falls back to
    // a generic icon — but at least the colour stays sensible.
    Telecom:        { icon: 'smartphone',        color: '#B9CAC2' },
    Online:         { icon: 'credit_score',      color: '#B9CAC2' },
    Mintpay:        { icon: 'currency_exchange', color: '#B9CAC2' },
    Koko:           { icon: 'currency_exchange', color: '#B9CAC2' },
    others:         { icon: 'more_horiz',        color: '#B9CAC2' }
  }
  return map[cat] || map.others
}

// Parse "dd/mm/yy" → ISO yyyy-MM-dd
function parseCombankDate(dateStr) {
  try {
    if (!dateStr) return null
    const [d, m, y] = dateStr.split('/').map(Number)
    const fullYear = y < 100 ? 2000 + y : y
    return `${fullYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────
// COMBANK parsers
// ──────────────────────────────────────────────

const CURRENCY = '(LKR|USD|Rs\\.?|SGD|EUR|GBP|AUD|INR|AED|JPY|CAD|CHF|CNY|HKD|MYR|THB|NZD|SAR|QAR)'

function normCurrency(raw) {
  const v = String(raw || '').toUpperCase()
  return /^RS/.test(v) || !v ? 'LKR' : v
}

function cardEnding(body) {
  const m = body.match(/card\s+ending\s*(?:with\s*)?#?\s*(\d{4})/i)
  return m ? m[1] : null
}

function balanceIn(body) {
  const m = body.match(new RegExp(`(?:Current|Available|Avl\\.?|Avail\\.?)\\s*B?al(?:ance)?\\.?\\s*(?:is\\s*)?:?\\s*${CURRENCY}\\s*([\\d,]+\\.?\\d*)`, 'i'))
  return m ? { currency: normCurrency(m[1]), amount: parseAmount(m[2]) } : null
}

// "Withdrawal at Peoples Bank WILACHCHIYA S LK for LKR 12,000.00 on 12/04/26 07:03 PM from card ending #3456."
function parseCombankWithdrawal(body) {
  const re = new RegExp(`Withdrawal at\\s+(.+?)\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+on\\s+(\\d{2}\\/\\d{2}\\/\\d{2,4})`, 'i')
  const m = body.match(re)
  if (!m) return null
  const merchant = cleanMerchant(m[1])
  const cat = detectCategory(merchant, 'withdrawal')
  return {
    type: 'withdrawal',
    direction: 'out',
    instrument: 'debit',
    bank: 'Commercial Bank',
    merchant,
    normalizedMerchant: normalizeMerchant(merchant),
    currency: normCurrency(m[2]),
    amount: parseAmount(m[3]),
    date: parseCombankDate(m[4]),
    card: cardEnding(body),
    category: cat.category,
    confidence: cat.confidence,
    categorySource: cat.source,
    note: `ATM withdrawal at ${merchant}`
  }
}

function parseCombankPurchase(body) {
  const re = new RegExp(`(?:Purchase|Payment|Debit)(?:\\s+at)?\\s+(.+?)\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+on\\s+(\\d{2}\\/\\d{2}\\/\\d{2,4})`, 'i')
  const m = body.match(re)
  if (!m) return null
  const merchant = cleanMerchant(m[1])
  const cat = detectCategory(merchant)
  return {
    type: 'purchase',
    direction: 'out',
    instrument: 'debit',
    bank: 'Commercial Bank',
    merchant,
    normalizedMerchant: normalizeMerchant(merchant),
    currency: normCurrency(m[2]),
    amount: parseAmount(m[3]),
    date: parseCombankDate(m[4]),
    card: cardEnding(body),
    via: /pay\s*pal/i.test(merchant) ? 'paypal' : undefined,
    category: cat.category,
    confidence: cat.confidence,
    categorySource: cat.source,
    note: merchant
  }
}

function parseCredit(body, bank) {
  if (!/\b(credited|deposited|deposit of|received)\b/i.test(body)) return null
  if (/\b(debited|withdrawal|purchase|payment received|received your payment|card payment|credit card|request|ComBank Digital|attempted)\b/i.test(body)) return null
  const amt = body.match(new RegExp(`${CURRENCY}\\s*([\\d,]+\\.?\\d*)`, 'i'))
  if (!amt) return null
  const acct = body.match(/A\/C(?:\s*No\.?)?\s*:?\s*([\dx*X]{4,})/i)
  const bal = balanceIn(body)
  const from = body.match(/\bfrom\s+([A-Z][A-Za-z0-9 .&'-]{2,40}?)(?:\s+(?:on|to|at|via|ref)\b|[.,]|$)/)
  const merchant = cleanMerchant(from ? from[1] : 'Money in')
  return {
    type: 'credit',
    direction: 'in',
    instrument: 'debit',
    bank,
    merchant,
    normalizedMerchant: normalizeMerchant(merchant),
    currency: normCurrency(amt[1]),
    amount: parseAmount(amt[2]),
    account: acct ? acct[1] : undefined,
    balance: bal ? bal.amount : undefined,
    balanceKind: bal ? 'account' : undefined,
    category: 'income',
    confidence: 'medium',
    categorySource: 'rule',
    note: merchant
  }
}

function parseCombankIncoming(body) {
  const transfer = body.match(new RegExp(`^Credit\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+to\\s+([\\dX*x]+)`, 'i'))
  const deposit = !transfer && body.match(new RegExp(`CRM\\s+Deposit\\s+at\\s+[\\d:]+\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+through\\s+(.+?)\\s+to\\s+your\\s+account\\s+([\\dX*x]+)`, 'i'))
  const m = transfer || deposit
  if (!m) return null
  const merchant = transfer ? 'Bank transfer in' : `Cash deposit, ${cleanMerchant(deposit[3]).replace(/-?CRM\d*\s*BR$/i, '').trim()}`
  return {
    type: 'credit',
    kind: transfer ? 'bank-transfer' : 'cash-deposit',
    direction: 'in',
    instrument: 'debit',
    bank: 'Commercial Bank',
    merchant,
    normalizedMerchant: normalizeMerchant(merchant),
    currency: normCurrency(m[1]),
    amount: parseAmount(m[2]),
    account: transfer ? m[3] : deposit[4],
    category: 'income',
    confidence: 'medium',
    categorySource: 'rule',
    note: merchant
  }
}

function parseCombankDigital(body) {
  const done = body.match(new RegExp(`^(.+?)\\s+in\\s+the\\s+amount\\s+of\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+was\\s+received\\s+on\\s+(\\d{2}\\/\\d{2}\\/\\d{2,4})\\s+from\\s+the\\s+ComBank\\s+Digital`, 'i'))
  if (done) {
    const what = cleanMerchant(done[1]).replace(/\s+Transaction$/i, '')
    const transfer = /Transfer/i.test(what)
    const cat = transfer ? { category: 'onlineTransfer', confidence: 'medium', source: 'rule' } : detectCategory(what, what)
    return {
      type: 'charge',
      kind: transfer ? 'bank-transfer' : undefined,
      direction: 'out',
      instrument: 'debit',
      bank: 'Commercial Bank',
      merchant: what,
      normalizedMerchant: normalizeMerchant(what),
      currency: normCurrency(done[2]),
      amount: parseAmount(done[3]),
      date: parseCombankDate(done[4]),
      category: transfer ? 'onlineTransfer' : (cat.category === 'others' ? 'bills' : cat.category),
      confidence: cat.confidence,
      categorySource: cat.source,
      note: what
    }
  }
  const attempt = body.match(new RegExp(`ComBank\\s+Digital-(.+?)\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+attempted`, 'i'))
  if (attempt) {
    return {
      type: 'confirmation',
      kind: 'transfer-attempt',
      direction: 'out',
      instrument: 'debit',
      bank: 'Commercial Bank',
      merchant: cleanMerchant(attempt[1]),
      normalizedMerchant: normalizeMerchant(attempt[1]),
      currency: normCurrency(attempt[2]),
      amount: parseAmount(attempt[3]),
      category: 'onlineTransfer',
      confidence: 'low',
      categorySource: 'rule',
      note: attempt[1]
    }
  }
  return null
}

function parseCombank(body) {
  if (/declined|One Time Password|\bOTP\b/i.test(body) && !/attempted/i.test(body)) return null
  return parseCombankWithdrawal(body) || parseCombankPurchase(body) || parseCombankIncoming(body) ||
    parseCombankDigital(body) || parseCredit(body, 'Commercial Bank')
}

// ──────────────────────────────────────────────
// NTB parsers
// ──────────────────────────────────────────────

function parseNtbTransaction(body) {
  const re = new RegExp(`A\\s+TRANSACTION\\s+of\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+was\\s+approved\\s+on\\s+your\\s+A\\/C\\s+No\\.?\\s+([\\dx*]+)\\s+at\\s+(.+?)\\.\\s+Current\\s+B?al(?:ance)?\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)`, 'i')
  const m = body.match(re)
  if (!m) return null
  const merchant = cleanMerchant(m[4])
  const reversal = /POS Reversal|REV POS|REVERSAL/i.test(merchant)
  const cat = detectCategory(merchant)
  return {
    type: reversal ? 'reversal' : 'purchase',
    direction: reversal ? 'in' : 'out',
    instrument: 'debit',
    bank: 'Nations Trust Bank',
    merchant,
    normalizedMerchant: normalizeMerchant(merchant),
    currency: normCurrency(m[1]),
    amount: parseAmount(m[2]),
    account: m[3],
    balance: parseAmount(m[6]),
    balanceKind: 'account',
    category: cat.category,
    confidence: cat.confidence,
    categorySource: cat.source,
    note: merchant
  }
}

// NTB credit-card purchase:
// "Transaction Approved on your Card 376657***1234 for LKR 1400.00 at CREPE RUNNER ONE GALLE FA Available Bal LKR 295002.16  Call 0114315315 for any inquiry."
// Captures the masked card so SmsEditSheet's matchCardByLast4 can pre-select
// the user's registered credit card.
function parseNtbCardTransaction(body) {
  const re = new RegExp(`Transaction\\s+(Approved|Reversal\\s+Accepted)\\s+on\\s+your\\s+Card\\s+(\\d+[\\*x]+\\d{4})\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+at\\s+(.+?)\\s+Available\\s+Bal(?:ance)?\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)`, 'i')
  const m = body.match(re)
  if (!m) return null
  const reversal = /Reversal/i.test(m[1])
  const cardMask = m[2]
  const last4 = (cardMask.match(/(\d{4})$/) || [])[1] || null
  const merchant = cleanMerchant(m[5])
  const cat = detectCategory(merchant)
  return {
    type: reversal ? 'reversal' : 'purchase',
    direction: reversal ? 'in' : 'out',
    instrument: 'credit',
    bank: 'Nations Trust Bank',
    merchant,
    normalizedMerchant: normalizeMerchant(merchant),
    currency: normCurrency(m[3]),
    amount: parseAmount(m[4]),
    card: last4,
    cardMask,
    balance: parseAmount(m[7]),
    balanceKind: 'available',
    category: cat.category,
    confidence: cat.confidence,
    categorySource: cat.source,
    note: merchant
  }
}

// "Fuel Surcharge was performed on your Account No. ... for LKR 11.38 DR..."
function parseNtbCharge(body) {
  const re = new RegExp(`^(.+?)\\s+was\\s+performed\\s+on\\s+your\\s+A(?:ccount|\\/C)\\s+No\\.?\\s*([\\dx*]+)\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s*(DR|CR)\\.?\\s+Current\\s+B?al(?:ance)?\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)`, 'i')
  const m = body.match(re)
  if (!m) return null
  const txType = cleanMerchant(m[1])
  const incoming = /CR/i.test(m[5])
  // For NTB structural charges, the txType IS the category hint — pass it as
  // transactionType so rule scoring uses it directly.
  const cat = incoming ? { category: 'income', confidence: 'medium', source: 'rule' } : detectCategory(txType, txType)
  const bankFee = /CEFTS CHARGES|SLIPS CHARGES|SERVICE CHARGE|SMS CHARGE|ATM WITHDRAWAL SC|ATM Service Charge|ATM CHARG|Annual Fe/i.test(txType)
  const atm = !incoming && /ATM CASH WITHDRAWAL/i.test(txType)
  let kind
  if (/Own Account Fund Transfer|^FUND TRANSFER$/i.test(txType)) kind = 'own-transfer'
  else if (bankFee) kind = incoming ? 'fee-refund' : 'bank-fee'
  else if (incoming && /REVERSAL|^REV\b|FOREIGN POS/i.test(txType)) kind = 'reversal'
  else if (/Dr\.?\s*Tran for funding/i.test(txType)) kind = 'deposit-fund'
  else if (incoming && /^Closu/i.test(txType)) kind = 'deposit-close'
  else if (/Other Bank Transfer|ONLINE FUND TRF|CEFTS|Within The Bank Transfer/i.test(txType)) kind = 'bank-transfer'
  else if (incoming && /Inward TT|Inward Remit|SWIFT/i.test(txType)) kind = 'remittance'
  return {
    type: incoming ? 'credit' : (atm ? 'withdrawal' : 'charge'),
    kind,
    direction: incoming ? 'in' : 'out',
    instrument: 'debit',
    bank: 'Nations Trust Bank',
    merchant: txType,
    normalizedMerchant: normalizeMerchant(txType),
    currency: normCurrency(m[3]),
    amount: parseAmount(m[4]),
    account: m[2],
    balance: parseAmount(m[7]),
    balanceKind: 'account',
    category: cat.category,
    confidence: cat.confidence,
    categorySource: cat.source,
    note: txType
  }
}

function parseNtbInterest(body) {
  const re = new RegExp(`:(Int|WTax)\\.Pd:.*?was\\s+performed\\s+on\\s+your\\s+A(?:ccount|\\/C)\\s+No\\.?\\s*([\\dx*X]+)\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)`, 'i')
  const m = body.match(re)
  if (!m) return null
  const interest = /^Int$/i.test(m[1])
  const merchant = interest ? 'Interest' : 'Withholding tax'
  return {
    type: interest ? 'credit' : 'charge',
    kind: interest ? 'interest' : 'bank-fee',
    direction: interest ? 'in' : 'out',
    instrument: 'debit',
    bank: 'Nations Trust Bank',
    merchant,
    normalizedMerchant: merchant.toUpperCase(),
    currency: normCurrency(m[3]),
    amount: parseAmount(m[4]),
    account: m[2],
    category: interest ? 'income' : 'bills',
    confidence: 'high',
    categorySource: 'rule',
    note: merchant
  }
}

function parseNtbCardPayment(body) {
  const m = body.match(new RegExp(`payment\\s+of\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)\\s+made\\s+to\\s+Card\\s*#?\\s*(\\d+[*x]+\\d{4})`, 'i'))
  if (!m) return null
  return {
    type: 'card-payment',
    direction: 'out',
    instrument: 'credit',
    bank: 'Nations Trust Bank',
    merchant: 'Card payment',
    normalizedMerchant: 'CARD PAYMENT',
    currency: normCurrency(m[1]),
    amount: parseAmount(m[2]),
    card: (m[3].match(/(\d{4})$/) || [])[1] || null,
    cardMask: m[3],
    category: 'creditCardPayment',
    confidence: 'high',
    categorySource: 'rule',
    note: 'Card payment'
  }
}

function parseNtbConfirmation(body) {
  const m = body.match(new RegExp(`(?:Funds successfully transferred!|bill Payment made from|You have made a fund transfer from)\\s+(?:[A-Z][A-Z ]*\\s)?([\\dX*x]+)\\s+to\\s+(.+?)\\s+for\\s+${CURRENCY}\\s*([\\d,]+\\.?\\d*)`, 'i'))
  if (!m) return null
  return {
    type: 'confirmation',
    direction: 'out',
    instrument: 'debit',
    bank: 'Nations Trust Bank',
    merchant: cleanMerchant(m[2]),
    normalizedMerchant: normalizeMerchant(m[2]),
    toBank: cleanMerchant(m[2]),
    currency: normCurrency(m[3]),
    amount: parseAmount(m[4]),
    account: m[1],
    category: 'onlineTransfer',
    confidence: 'low',
    categorySource: 'rule',
    note: m[2]
  }
}

function parseNtb(body) {
  if (/Transaction\s+declined/i.test(body)) return null
  return parseNtbCardTransaction(body) || parseNtbTransaction(body) || parseNtbCharge(body) ||
    parseNtbInterest(body) || parseNtbCardPayment(body) || parseNtbConfirmation(body) || parseCredit(body, 'Nations Trust Bank')
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

// Promo / non-transaction noise. Broader than the original 5-pattern filter.
const PROMO_PATTERNS = [
  /beware of scammers/i,
  /reward points/i,
  /click here/i,
  /promotional/i,
  /\b(special offer|exclusive offer|cashback offer|festive offer|loan offer)\b/i,
  /\bwin (a|free|exciting)\b/i,
  /\bvisit (us|our)\b.*\bwww\./i,
  /\bsms (stop|unsubscribe)\b/i,
  /\bcongratulations\b/i
]

export function parseSms(message) {
  if (!message || !message.body) return null
  const sender = (message.address || '').trim()
  const body = message.body.trim()

  // Skip promo / informational messages
  for (const re of PROMO_PATTERNS) {
    if (re.test(body)) return null
  }

  let parsed = null
  if (/COMBANK|COMBNK/i.test(sender)) {
    parsed = parseCombank(body)
  } else if (/Nations(?:SMS|TrustBank|TB)?|NTB/i.test(sender)) {
    parsed = parseNtb(body)
  }

  if (!parsed) return null

  // Attach metadata
  parsed.senderId = sender
  parsed.bankDisplay = SENDER_MAP[sender] || sender
  parsed.rawBody = body
  parsed.smsDate = message.date || Date.now()
  if (!parsed.date && parsed.smsDate) {
    const d = new Date(parsed.smsDate)
    parsed.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  parsed.categoryMeta = categoryMeta(parsed.category)

  // Fingerprint: include a short body prefix so two same-day same-amount
  // same-merchant SMS don't collide and get silently deduped.
  const bodyHash = body.slice(0, 24).replace(/\s+/g, '')
  parsed.fingerprint = `${sender}|${parsed.smsDate}|${parsed.amount}|${parsed.merchant}|${bodyHash}`

  return parsed
}

const COMMON_WORDS = new Set(['ONE', 'THE', 'AND', 'FOR', 'OF', 'AT', 'IN', 'ON', 'TO', 'CO', 'LTD', 'PVT', 'BAR', 'BAY', 'CAFE'])

export function prettyMerchant(name) {
  if (!name) return ''
  return name
    .split(' ')
    .map(w => (/^[A-Z][A-Z'&.-]*$/.test(w) && (w.length > 3 || COMMON_WORDS.has(w)) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
    .join(' ')
}

export function parseSmsList(messages) {
  return (messages || []).map(parseSms).filter(Boolean)
}

export { detectCategory, categoryMeta, normalizeMerchant }
