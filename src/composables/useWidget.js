import { Capacitor, registerPlugin } from '@capacitor/core'
import { useFinanceStore } from '../stores/financeStore'
import { useAccountsStore } from '../stores/accountsStore'
import { buildWidgetSnapshot } from '../utils/widgetSnapshot'

const FlowwWidget = registerPlugin('FlowwWidget')

export function useWidget() {
  async function updateWidget() {
    if (Capacitor.isNativePlatform()) {
      try {
        const snapshot = buildWidgetSnapshot(useFinanceStore(), useAccountsStore())
        await FlowwWidget.updateWidget({ snapshot: JSON.stringify(snapshot) })
      } catch (err) {
        console.warn('[FLOWW] Widget update:', err?.message || 'unavailable')
      }
    }
  }

  return { updateWidget }
}
