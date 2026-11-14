import { boot } from 'quasar/wrappers'
import { initStorage } from '../utils/capacitorStorage'

export default boot(async () => {
  // Pre-load all store data from native storage into memory cache
  // This MUST complete before Pinia initializes so stores have data ready
  await initStorage()
})
