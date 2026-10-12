import { createRequire } from 'node:module'
const require_ = createRequire(import.meta.url)
const { rowSummary, shortWindowLabel } = require_('../lib/view.js')
const t = (k) => ({ left: '剩余', stateOk: '正常', stateError: '查询失败' }[k] ?? k)
const neo = {
  id: 'neo', label: 'Neo 网关', state: 'ok',
  balances: [{ currency: 'USD', total: 299.8 }],
  limits: [
    { label: '月度套餐 · 日额度', kind: 'credits', used: 10, total: 500, remaining: 490, percent: 2, resetsAt: 1791700000000 },
    { label: '月度套餐 · 周额度', kind: 'credits', used: 100, total: 3000, remaining: 2900, percent: 3.3, resetsAt: 1791800000000 },
    { label: '月度套餐 · 月额度', kind: 'credits', used: 200, total: 10000, remaining: 9800, percent: 2, resetsAt: 1793000000000 },
  ],
}
const s = rowSummary(neo, t, Date.now())
console.log('neo sidebar:', s)
if (s !== 'Neo 网关: 日额度 剩余 98%') throw new Error('unexpected: ' + s)
const ds = { id: 'ds', label: 'DeepSeek 官方', state: 'ok', balances: [{ currency: 'CNY', total: 19.84, granted: 0, toppedUp: 19.84 }], limits: [] }
const s2 = rowSummary(ds, t, Date.now())
console.log('deepseek sidebar:', s2)
if (s2 !== 'DeepSeek 官方: 19.84 CNY') throw new Error('unexpected: ' + s2)
if (shortWindowLabel('5小时窗口') !== '5小时窗口') throw new Error('short label passthrough failed')
console.log('SUMMARY OK')
process.exit(0)
