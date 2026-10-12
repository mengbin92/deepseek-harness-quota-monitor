// Store fallback: accessor returns undefined -> plain HTTP wire call must
// deliver the snapshot, and status must flip to ready.
import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { createQuotaStore } = require_('../lib/store.js')

const SNAP = { fetchedAt: 1, providers: [{ id: 'deepseek', label: 'DeepSeek', state: 'ok', balances: [{ currency: 'CNY', total: 21.37 }], limits: [] }] }
let calls = []
globalThis.fetch = async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) })
  return new Response(JSON.stringify({ type: 'server-response', rpcId: 'x', result: { ok: true, value: SNAP } }), { status: 200 })
}

const store = createQuotaStore(() => undefined)
const stop = store.start()
await new Promise((r) => setTimeout(r, 50))
stop()
if (store.getStatus().kind !== 'ready') throw new Error('status not ready: ' + JSON.stringify(store.getStatus()))
if (store.getSnapshot()?.providers?.[0]?.balances?.[0]?.total !== 21.37) throw new Error('snapshot mismatch')
if (calls[0].url !== '/api/quota/snapshot' || calls[0].body.method !== 'quota/snapshot') throw new Error('wire format wrong')
console.log('FALLBACK OK')
// typed path: accessor returns namespace -> no fetch
calls = []
const store2 = createQuotaStore(() => ({ snapshot: async () => SNAP, refresh: async () => SNAP }))
const stop2 = store2.start()
await new Promise((r) => setTimeout(r, 50))
stop2()
if (calls.length !== 0) throw new Error('typed path should not fetch')
if (store2.getSnapshot()?.providers?.[0]?.balances?.[0]?.total !== 21.37) throw new Error('typed snapshot mismatch')
if (!store2.isRemoteMounted()) throw new Error('remoteMounted flag missing')
console.log('TYPED PATH OK')
process.exit(0)
