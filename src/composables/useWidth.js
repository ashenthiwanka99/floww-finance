import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useWidth(el, fallback = 340) {
  const width = ref(fallback)
  let observer
  onMounted(() => {
    if (!el.value) return
    width.value = el.value.clientWidth || fallback
    observer = new ResizeObserver(([entry]) => { width.value = Math.round(entry.contentRect.width) || fallback })
    observer.observe(el.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return width
}
