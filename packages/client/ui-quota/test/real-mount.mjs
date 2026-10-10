// Load the REAL dsh-typert-registry + dsh-api-gateway client bundles in Node
// with a stub ModuleLoader, then run the real $mount against our real
// TYPERT_REMOTE contribution to find any validation failure.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require_ = createRequire('/Users/neo/Desktop/dsh/packages/client/ui-quota/test/')
const NM = '/Users/neo/.dsh/profiles/node_modules/@deepseek-ai'

const registrations = []
globalThis.window = { __ModuleLoader__: { load: (d) => registrations.push(d) } }
const seed = new Map([
  ['@deepseek-ai/cordis', require_('@deepseek-ai/cordis')],
  ['react', { createElement: () => ({}), useState: (i) => [i, () => {}], useEffect: () => {} }],
  ['react/jsx-runtime', { jsx: () => ({}), jsxs: () => ({}), Fragment: 0 }],
])
const requireFromTable = (spec) => {
  if (seed.has(spec)) return seed.get(spec)
  const row = registrations.find((r) => r.id === spec || r.id === spec.replace(/\/client$/, ''))
  if (row && !row.__exports) row.__exports = row.factory(requireFromTable)
  if (row) return row.__exports
  throw new Error('seed miss: ' + spec)
}
for (const file of [`${NM}/dsh-typert-registry/lib/client.js`, `${NM}/dsh-api-gateway/lib/client.js`]) {
  eval(readFileSync(file, 'utf8'))
}
console.log('loaded bundles:', registrations.map((r) => r.id).join(', '))

// Boot a client-like cordis tree: root + registry + a stub connection, then
// the gateway ClientRemoteService apply.
const { Context } = require_('@deepseek-ai/cordis')
const root = new Context()
const registry = registrations.find((r) => r.id === '@deepseek-ai/dsh-typert-registry').__exports ??
  registrations.find((r) => r.id === '@deepseek-ai/dsh-typert-registry').factory(requireFromTable)
console.log('registry exports:', Object.keys(registry))
// mount its client face
const regApply = registry.apply ?? registry.default?.apply
if (regApply) regApply(root)
await new Promise((r) => setTimeout(r, 100))
console.log('ctx.typert:', typeof root.typert)

// stub connection service the gateway expects
root.provide('connection', {
  rpc: { open: async function* () {}, call: async () => ({ ok: true, value: {} }) },
  generation: { getSnapshot: () => undefined, subscribe: () => () => {} },
  isLoopback: true,
  registerGenerationSource: () => () => {},
  start: () => ({ stop: () => {} }),
})
const gateway = registrations.find((r) => r.id === '@deepseek-ai/dsh-api-gateway').factory(requireFromTable)
console.log('gateway exports:', Object.keys(gateway))
const gwApply = gateway.apply ?? gateway.default?.apply
gwApply(root)
await new Promise((r) => setTimeout(r, 200))
console.log('ctx.remote:', typeof root.remote)

const { TYPERT_REMOTE } = await import('/Users/neo/Desktop/dsh/packages/quota-monitor/lib/remote-client.js')
try {
  const dispose = await root.remote.$mount(TYPERT_REMOTE)
  console.log('$mount OK, dispose:', typeof dispose)
  console.log('remote.quota:', typeof root.remote.quota, typeof root.remote.quota?.snapshot)
} catch (error) {
  console.log('$mount FAILED:', error.message)
}
process.exit(0)
