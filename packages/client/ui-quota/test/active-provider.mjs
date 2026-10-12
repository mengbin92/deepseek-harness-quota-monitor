// Tracker + footer focus logic with mocked ctx services.
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { createActiveProviderTracker } = require_('../lib/active-provider.js')

let currentProvider = 'neo'
const ctx = {
  sessions: { list: { getSnapshot: () => ({ byId: { s1: { retainedBy: { mainView: 1 } } } }) } },
  modelDirectories: { directoryFor: () => ({ store: { getSnapshot: () => ({ current: { provider: currentProvider } }) } }) },
}
const tracker = createActiveProviderTracker(ctx)
if (tracker.getProvider() !== 'neo') throw new Error('expected neo, got ' + tracker.getProvider())

// provider switch propagates to subscribers within one tick
let seen
tracker.subscribe(() => { seen = tracker.getProvider() })
currentProvider = 'kimi-coding'
await new Promise((r) => setTimeout(r, 5200))
if (seen !== 'kimi-coding') throw new Error('switch not tracked: ' + seen)

// missing services degrade to undefined, never throw
const empty = createActiveProviderTracker({})
if (empty.getProvider() !== undefined) throw new Error('degraded tracker must be undefined')
tracker.dispose(); empty.dispose()
console.log('TRACKER OK')
process.exit(0)
