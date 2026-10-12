/**
 * DeepSeek official balance endpoint: GET {baseURL}/user/balance with a
 * Bearer key, answering `balance_infos` lines.
 *
 * @module dsh-quota-monitor/fetchers/deepseek
 */
import type { BalanceFetcher, BalanceFetchRequest, BalanceFetchResult, BalanceInfo } from '../types.js'
import { fetchJson, joinUrl, readPathString, toNumber } from './util.js'

interface DeepSeekBalanceLine {
  currency?: string
  total_balance?: string
  granted_balance?: string
  topped_up_balance?: string
}

export const deepseekBalanceFetcher: BalanceFetcher = {
  kind: 'deepseek-balance',
  async fetch(request: BalanceFetchRequest): Promise<BalanceFetchResult> {
    const baseURL = request.baseURL ?? 'https://api.deepseek.com'
    const envName = typeof request.options['apiKeyEnv'] === 'string' ? request.options['apiKeyEnv'] : 'DEEPSEEK_API_KEY'
    const apiKey = await request.resolveKey(envName)
    if (!apiKey) throw new Error(`credential ${envName} is not configured`)
    const doc = (await fetchJson(joinUrl(baseURL, '/user/balance'), { apiKey, signal: request.signal })) as {
      is_available?: boolean
      balance_infos?: DeepSeekBalanceLine[]
    }
    const lines = Array.isArray(doc.balance_infos) ? doc.balance_infos : []
    const balances: BalanceInfo[] = lines.map((line) => ({
      currency: line.currency ?? 'CNY',
      total: toNumber(line.total_balance),
      granted: toNumber(line.granted_balance),
      toppedUp: toNumber(line.topped_up_balance),
    }))
    if (balances.length === 0) {
      // Some proxies answer a flat document instead of balance_infos.
      const total = readPathString(doc, 'total_balance')
      if (total !== undefined) balances.push({ currency: 'CNY', total: toNumber(total) })
    }
    return { balances }
  },
}
