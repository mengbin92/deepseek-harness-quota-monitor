// Smoke test: mock global fetch, drive each built-in fetcher, assert parsing.
import { deepseekBalanceFetcher } from '../lib/fetchers/deepseek.js'
import { zaiQuotaFetcher } from '../lib/fetchers/zai.js'
import { genericHttpFetcher } from '../lib/fetchers/generic-http.js'

const realFetch = globalThis.fetch
let lastUrl = ''
let lastHeaders = {}

globalThis.fetch = async (url, init) => {
  lastUrl = String(url)
  lastHeaders = init?.headers ?? {}
  if (lastUrl.includes('/user/balance')) {
    return jsonResponse({
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '42.50', granted_balance: '2.50', topped_up_balance: '40.00' }],
    })
  }
  if (lastUrl.includes('/api/monitor/usage/quota/limit')) {
    return jsonResponse({
      data: {
        limits: [
          { type: 'TOKENS_LIMIT', unit: 3, number: 100000000, usage: 12000000, nextResetTime: Date.now() + 3600_000 },
          { type: 'TOKENS_LIMIT', unit: 6, number: 500000000, usage: 240000000, nextResetTime: Date.now() + 4 * 86400_000 },
        ],
      },
    })
  }
  return jsonResponse({ data: { balance: '9.99', used: 1.01 } })
}

const jsonResponse = (doc) =>
  new Response(JSON.stringify(doc), { status: 200, headers: { 'content-type': 'application/json' } })

const resolveKey = async () => 'sk-test'

const deepseek = await deepseekBalanceFetcher.fetch({
  baseURL: 'https://api.deepseek.com',
  options: { apiKeyEnv: 'DEEPSEEK_API_KEY' },
  signal: AbortSignal.timeout(5000),
  resolveKey,
})
console.log('deepseek:', lastUrl, JSON.stringify(deepseek))
if (deepseek.balances?.[0]?.total !== 42.5) throw new Error('deepseek parse failed')
if (lastHeaders['authorization'] !== 'Bearer sk-test') throw new Error('auth header missing')

const zai = await zaiQuotaFetcher.fetch({
  baseURL: 'https://open.bigmodel.cn',
  options: { apiKeyEnv: 'ZAI_API_KEY', organization: 'org-x', project: 'proj_y', type: 2 },
  signal: AbortSignal.timeout(5000),
  resolveKey,
})
console.log('zai:', lastUrl, JSON.stringify(zai))
if (zai.limits?.length !== 2) throw new Error('zai limits count wrong')
if (zai.limits[0].label !== '5小时窗口' || zai.limits[0].percent !== 12) throw new Error('zai 5h parse failed')
if (zai.limits[1].label !== '7天窗口' || zai.limits[1].percent !== 48) throw new Error('zai 7d parse failed')
if (lastHeaders['bigmodel-organization'] !== 'org-x') throw new Error('org header missing')
if (!lastUrl.includes('type=2')) throw new Error('type query missing')

const generic = await genericHttpFetcher.fetch({
  baseURL: 'http://gw.local:3000',
  options: {
    path: '/v1/quota',
    apiKeyEnv: 'LOCAL_API_KEY',
    mapping: { balancePath: 'data.balance', usedPath: 'data.used', currency: 'USD' },
  },
  signal: AbortSignal.timeout(5000),
  resolveKey,
})
console.log('generic:', lastUrl, JSON.stringify(generic))
if (generic.balances?.[0]?.total !== 9.99 || generic.balances[0].currency !== 'USD') throw new Error('generic parse failed')

globalThis.fetch = realFetch
console.log('SMOKE OK')

// --- neo-gateway fetcher (mock) ---
const { neoGatewayFetcher } = await import('../lib/fetchers/neo-gateway.js')
globalThis.fetch = async (url) => {
  if (String(url).includes('/v1/subscription/usage')) {
    return jsonResponse({
      success: true, planName: '月度套餐', unit: 'USD',
      data: { status: 'active',
        daily_used: { used: 50, limit: 500, remaining: 450, next_refresh: 1791599733 },
        weekly_used: { used: 100, limit: 3000, remaining: 2900, next_refresh: 1791686133 } },
    })
  }
  return jsonResponse({ balance: 299.8, remaining: 299.8, unit: 'USD', quota: { per_usd: 10000 }, usage: { total: { cost: 47900000 } } })
}
const neo = await neoGatewayFetcher.fetch({
  baseURL: 'https://gw.example', options: { apiKeyEnv: 'NEO_API_KEY' },
  signal: AbortSignal.timeout(5000), resolveKey,
})
console.log('neo:', JSON.stringify(neo))
if (neo.balances?.[0]?.total !== 299.8) throw new Error('neo wallet parse failed')
if (neo.balances[0].used !== 4790) throw new Error('neo used conversion failed')
if (neo.limits?.length !== 2 || neo.limits[0].percent !== 10) throw new Error('neo limits parse failed')
if (neo.limits[0].resetsAt !== 1791599733000) throw new Error('neo resetsAt seconds->ms failed')
globalThis.fetch = realFetch
console.log('NEO SMOKE OK')
