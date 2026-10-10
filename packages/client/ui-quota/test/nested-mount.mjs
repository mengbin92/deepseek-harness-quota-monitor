// Validate the nested-fiber mount path: top apply -> $mount -> ctx.plugin
// with inject ['remote.quota'] -> inner apply reads the namespace via get().
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require_ = createRequire('/Users/neo/Desktop/dsh/packages/client/ui-quota/test/')
const reactStub = {
  createElement: (t, p, ...c) => ({ type: t, props: { ...p, children: c } }),
  useState: (i) => [typeof i === 'function' ? i() : i, () => {}],
  useEffect: () => {},
  Fragment: Symbol('F'),
}
const seed = new Map([
  ['react', reactStub],
  ['react/jsx-runtime', { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }), Fragment: Symbol('F') }],
  ['@deepseek-ai/cordis', require_('@deepseek-ai/cordis')],
])
const registrations = []
globalThis.window = { __ModuleLoader__: { load: (d) => registrations.push(d) } }
eval(readFileSync('/Users/neo/Desktop/dsh/packages/client/ui-quota/lib/client.js', 'utf8'))
const exports_ = registrations[0].factory((s) => {
  if (seed.has(s)) return seed.get(s)
  throw new Error('seed miss: ' + s)
})

const SNAP = { fetchedAt: 1, providers: [{ id: 'deepseek', label: 'D', state: 'ok', balances: [{ currency: 'CNY', total: 21.37 }], limits: [] }] }
let innerInject
const namespace = { snapshot: async () => SNAP, refresh: async () => SNAP }
const remote = { async $mount() { return () => {} } }
const dicts = {}
const slotsSeen = []
const innerCtx = { get: (key) => (key === 'remote.quota' ? namespace : undefined), on: () => {} }
const ctx = {
  locale: { register(ns, d) { dicts[ns] = d }, bind: (ns) => (k) => dicts[ns]?.en?.[k] ?? k },
  remote,
  slots: { inject: (n, reg) => slotsSeen.push([n, reg?.()]), register: (m) => { slotsSeen.push([m.name, m.id]); return () => {} } },
  on: () => {},
  plugin(spec) { innerInject = spec.inject; spec.apply(innerCtx) },
}
exports_.apply(ctx)
await new Promise((r) => setTimeout(r, 50))
if (!innerInject?.includes('remote.quota')) throw new Error('nested fiber did not inject remote.quota: ' + JSON.stringify(innerInject))
if (!slotsSeen.flat().includes('settings.section')) throw new Error('slots not registered')
console.log('nested inject:', JSON.stringify(innerInject))
console.log('slots:', slotsSeen.map((s) => s[0]).join(', '))
console.log('NESTED MOUNT OK')
process.exit(0)
