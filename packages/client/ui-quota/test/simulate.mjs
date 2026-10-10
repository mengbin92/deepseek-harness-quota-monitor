// Simulate the DSH client module system in Node: emulate
// window.__ModuleLoader__, a seed require (react stubbed), execute the built
// bundle, then run apply() against a mock cordis client context. Catches
// "import failed" / apply-time errors without a browser.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)

// --- react stub sufficient for createElement-only code paths ---
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  Fragment: Symbol('Fragment'),
}
const seed = new Map([
  ['react', reactStub],
  ['react/jsx-runtime', { jsx: (t, p) => ({ type: t, props: p }), jsxs: (t, p) => ({ type: t, props: p }), Fragment: Symbol('F') }],
  ['@deepseek-ai/cordis', require_('@deepseek-ai/cordis')],
])

// --- module loader emulation ---
const registrations = []
globalThis.window = {
  __ModuleLoader__: {
    load(def) {
      registrations.push(def)
    },
  },
}

const code = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
eval(code)

if (registrations.length !== 1) throw new Error(`expected 1 registration, got ${registrations.length}`)
const reg = registrations[0]
console.log('registered id:', reg.id)
const exports_ = reg.factory((spec) => {
  if (seed.has(spec)) return seed.get(spec)
  throw new Error(`seed miss: ${spec}`)
})
console.log('exports:', Object.keys(exports_))
if (typeof exports_.apply !== 'function') throw new Error('no apply export')
if (!Array.isArray(exports_.inject)) throw new Error('no inject export')
console.log('inject:', exports_.inject.join(', '))

// --- mock client context ---
const registeredSlots = []
let mountedContribution
const dicts = {}
const ctx = {
  locale: {
    register(ns, d) {
      dicts[ns] = d
    },
    bind: (ns) => (key) => dicts[ns]?.en?.[key] ?? key,
  },
  remote: {
    async $mount(contribution) {
      mountedContribution = contribution
      return () => {}
    },
  },
  slots: {
    inject(name, register) {
      if (typeof register === 'function') registeredSlots.push([name, register()])
    },
    register(meta, component) {
      registeredSlots.push([meta.name, meta.id])
      return () => {}
    },
  },
  on: () => {},
}

exports_.apply(ctx)
await new Promise((r) => setTimeout(r, 50))

if (!dicts['quota']?.en?.['nav']) throw new Error('locale dictionary not registered')
console.log('locale nav:', dicts['quota'].zh['nav'], '/', dicts['quota'].en['nav'])
if (!mountedContribution) throw new Error('remote contribution not mounted')
console.log('remote descriptors:', mountedContribution.descriptors.map((d) => d.id).join(', '))
const slotNames = registeredSlots.map((s) => `${s[0]}${s[1] ? ':' + s[1] : ''}`).join(', ')
if (!slotNames.includes('settings.section:quota')) throw new Error('settings.section not registered')
if (!slotNames.includes('sidebar.footer.action:quota')) throw new Error('sidebar.footer.action not registered')
console.log('slots:', slotNames)
console.log('CLIENT BUNDLE OK')
process.exit(0)
