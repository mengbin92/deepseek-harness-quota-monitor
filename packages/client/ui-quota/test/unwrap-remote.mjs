// Regression: typed namespace returning the RemoteResult envelope must unwrap.
import { createRequire } from 'node:module'
const require_ = createRequire('/Users/neo/Desktop/dsh/packages/client/ui-quota/test/')
const { createQuotaStore } = require_('/Users/neo/Desktop/dsh/packages/client/ui-quota/lib/store.js')
const SNAP = { fetchedAt: 1, providers: [{ id: 'x', label: 'x', state: 'ok', balances: [], limits: [] }] }
const ns = {
  snapshot: async () => ({ ok: true, value: SNAP }),
  refresh: async () => ({ ok: true, value: SNAP }),
}
const store = createQuotaStore(() => ns)
const stop = store.start()
await new Promise((r) => setTimeout(r, 30))
stop()
if (store.getSnapshot()?.providers?.length !== 1) throw new Error('envelope not unwrapped')
if (store.getStatus().kind !== 'ready') throw new Error('status wrong')
// failure envelope must surface as error status, not crash
const nsFail = { snapshot: async () => ({ ok: false, error: { code: 'gateway/internal', message: 'boom' } }), refresh: async () => ({}) }
const store2 = createQuotaStore(() => nsFail)
const stop2 = store2.start()
await new Promise((r) => setTimeout(r, 30))
stop2()
if (store2.getStatus().kind !== 'error' || !store2.getStatus().message.includes('boom')) throw new Error('failure envelope mishandled: ' + JSON.stringify(store2.getStatus()))
console.log('UNWRAP OK')
process.exit(0)
