/**
 * Neo gateway (micro-one-api) quota fetcher: combines the wallet balance
 * (`GET /v1/usage`) and the subscription plan usage windows
 * (`GET /v1/subscription/usage`) into one provider row. Both endpoints take
 * the same relay API key used for /v1/chat/completions.
 *
 * @module dsh-quota-monitor/fetchers/neo-gateway
 */
import type { BalanceFetcher, BalanceFetchRequest, BalanceFetchResult, BalanceInfo, LimitInfo } from '../types.js'
import { fetchJson, joinUrl } from './util.js'

interface NeoUsageWindow {
  used?: number
  limit?: number
  remaining?: number
  next_refresh?: number
  unlimited?: boolean
}

interface NeoUsageResponse {
  balance?: number
  remaining?: number
  unit?: string
  planName?: string
  quota?: { per_usd?: number; remaining?: number; used?: number }
  usage?: { total?: { cost?: number; requests?: number } }
}

interface NeoSubscriptionResponse {
  success?: boolean
  message?: string
  planName?: string
  unit?: string
  data?: {
    status?: string
    subscription_name?: string
    daily_used?: NeoUsageWindow
    weekly_used?: NeoUsageWindow
    monthly_used?: NeoUsageWindow
  }
}

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

function windowLimit(label: string, window: NeoUsageWindow | undefined): LimitInfo | undefined {
  if (!window || window.unlimited === true) return undefined
  const used = num(window.used)
  const total = num(window.limit)
  const remaining = num(window.remaining)
  const resetsAt = num(window.next_refresh)
  const limit: LimitInfo = { label, kind: 'credits' }
  if (used !== undefined) limit.used = used
  if (total !== undefined) limit.total = total
  if (remaining !== undefined) limit.remaining = remaining
  if (used !== undefined && total) limit.percent = Math.round((used / total) * 1000) / 10
  if (resetsAt !== undefined) limit.resetsAt = resetsAt * 1000
  return limit
}

export const neoGatewayFetcher: BalanceFetcher = {
  kind: 'neo-gateway',
  async fetch(request: BalanceFetchRequest): Promise<BalanceFetchResult> {
    const options = request.options
    const baseURL = request.baseURL ?? 'https://api.mengbin.top'
    const envName = typeof options['apiKeyEnv'] === 'string' ? options['apiKeyEnv'] : 'NEO_API_KEY'
    const apiKey = await request.resolveKey(envName)
    if (!apiKey) throw new Error(`credential ${envName} is not configured`)
    const wantWallet = options['wallet'] !== false
    const wantSubscription = options['subscription'] !== false

    const [walletResult, subscriptionResult] = await Promise.allSettled([
      wantWallet
        ? fetchJson(joinUrl(baseURL, '/v1/usage'), { apiKey, signal: request.signal })
        : Promise.resolve<null>(null),
      wantSubscription
        ? fetchJson(joinUrl(baseURL, '/v1/subscription/usage'), { apiKey, signal: request.signal })
        : Promise.resolve<null>(null),
    ])

    const balances: BalanceInfo[] = []
    if (walletResult.status === 'fulfilled' && walletResult.value !== null) {
      const doc = walletResult.value as NeoUsageResponse
      const remaining = num(doc.remaining) ?? num(doc.balance)
      const perUsd = num(doc.quota?.per_usd)
      const costQuota = num(doc.usage?.total?.cost)
      const balance: BalanceInfo = { currency: doc.unit ?? 'USD' }
      if (remaining !== undefined) balance.total = remaining
      if (costQuota !== undefined && perUsd) balance.used = Math.round((costQuota / perUsd) * 10000) / 10000
      if (balance.total === undefined && balance.used === undefined) {
        throw new Error('wallet endpoint returned no balance fields')
      }
      balances.push(balance)
    }

    const limits: LimitInfo[] = []
    if (subscriptionResult.status === 'fulfilled' && subscriptionResult.value !== null) {
      const doc = subscriptionResult.value as NeoSubscriptionResponse
      // success:false means "no active subscription" — a normal state, not an error.
      if (doc.success !== false && doc.data) {
        const plan = doc.planName ?? doc.data.subscription_name ?? '订阅'
        for (const [suffix, window] of [
          ['日额度', doc.data.daily_used],
          ['周额度', doc.data.weekly_used],
          ['月额度', doc.data.monthly_used],
        ] as const) {
          const limit = windowLimit(`${plan} · ${suffix}`, window)
          if (limit) limits.push(limit)
        }
      }
    }

    if (balances.length === 0 && limits.length === 0) {
      const walletError = walletResult.status === 'rejected' ? walletResult.reason : undefined
      const subscriptionError = subscriptionResult.status === 'rejected' ? subscriptionResult.reason : undefined
      const parts = [
        walletError instanceof Error ? `wallet: ${walletError.message}` : undefined,
        subscriptionError instanceof Error ? `subscription: ${subscriptionError.message}` : undefined,
      ].filter(Boolean)
      throw new Error(parts.length > 0 ? parts.join('; ') : 'no quota data returned')
    }
    return { balances, limits }
  },
}
