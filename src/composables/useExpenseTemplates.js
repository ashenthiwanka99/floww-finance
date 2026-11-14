import { computed } from 'vue'
import { useFinanceStore } from '../stores/financeStore'
import { getCategoryIcon } from '../utils/categoryConfig'

export function useExpenseTemplates() {
  const financeStore = useFinanceStore()

  const templates = computed(() => {
    // Group expenses by name, count frequency, pick most recent for category/icon
    const nameMap = new Map()
    for (const e of financeStore.expenses) {
      if (!e.name || e.isAggregate || e.isRecurring || e.category === 'lend' || e.category === 'savings' || e.category === 'subscriptions' || e.category === 'loans') continue
      const key = e.name.trim()
      if (!nameMap.has(key)) {
        nameMap.set(key, { name: key, count: 0, latest: e })
      }
      const entry = nameMap.get(key)
      entry.count++
      if ((e.createdAt || 0) > (entry.latest.createdAt || 0)) {
        entry.latest = e
      }
    }

    return Array.from(nameMap.values())
      .filter(t => t.count >= 2) // Only show if used at least twice
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(t => {
        const catInfo = getCategoryIcon(t.latest.category)
        return {
          name: t.name,
          category: t.latest.category,
          icon: t.latest.icon || catInfo.icon,
          iconColor: t.latest.iconColor || catInfo.color,
          count: t.count
        }
      })
  })

  return { templates }
}
