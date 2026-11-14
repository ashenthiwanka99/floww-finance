export function niceTicks(max, count = 3) {
  if (!(max > 0)) return [0, 1]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag
  let top = Math.ceil(max / step) * step
  if (top <= max) top += step
  const ticks = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return ticks
}

const compactFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
export const compact = v => compactFormat.format(v).toLowerCase()
