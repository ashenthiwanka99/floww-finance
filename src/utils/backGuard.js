// Tracks how many modal surfaces (bottom sheets) are currently open so the
// global hardware-back handler in App.vue doesn't also navigate to dashboard
// when back is meant to just close the open sheet.
let openCount = 0

export function pushBackConsumer() {
  openCount++
}

export function popBackConsumer() {
  openCount = Math.max(0, openCount - 1)
}

export function hasBackConsumer() {
  return openCount > 0
}
