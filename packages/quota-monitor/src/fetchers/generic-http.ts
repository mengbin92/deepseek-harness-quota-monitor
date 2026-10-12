/**
 * Generic HTTP balance fetcher for self-hosted gateways and third-party
 * OpenAI-compatible endpoints: user-configured path, headers, and dotted
 * field mapping over the JSON response.
 *
 * @module dsh-quota-monitor/fetchers/generic-http
 */
import type { BalanceFetcher, BalanceFetchRequest, BalanceFetchResult, BalanceInfo } from '../types.js'
import { fetchJson, joinUrl, readPath, readPathString, toNumber } from './util.js'

export const genericHttpFetcher: BalanceFetcher = {
  kind: 'generic-http',
  async fetch(request: BalanceFetchRequest): Promise<BalanceFetchResult> {
    const options = request.options
    const path = typeof options['path'] === 'string' ? options['path'] : undefined
    if (!request.baseURL || !path) throw new Error('generic-http fetcher requires baseURL and path')
    const envName = typeof options['apiKeyEnv'] === 'string' ? options['apiKeyEnv'] : undefined
    const apiKey = envName ? await request.resolveKey(envName) : undefined
    if (envName && !apiKey) throw new Error(`credential ${envName} is not configured`)
    const extraHeaders =
      options['headers'] && typeof options['headers'] === 'object'
        ? (options['headers'] as Record<string, string>)
        : undefined
    const doc = await fetchJson(joinUrl(request.baseURL, path), { apiKey, headers: extraHeaders, signal: request.signal })
    const mapping =
      options['mapping'] && typeof options['mapping'] === 'object'
        ? (options['mapping'] as Record<string, string>)
        : {}
    const balance: BalanceInfo = {
      currency: readPathString(doc, mapping['currencyPath']) ?? mapping['currency'] ?? 'USD',
      total: readPath(doc, mapping['balancePath']),
      used: readPath(doc, mapping['usedPath']),
    }
    const granted = readPath(doc, mapping['grantedPath'])
    const toppedUp = readPath(doc, mapping['toppedUpPath'])
    const totalLimit = readPath(doc, mapping['totalPath'])
    const limitsPath = mapping['limitsPath']
    if (granted !== undefined) balance.granted = granted
    if (toppedUp !== undefined) balance.toppedUp = toppedUp
    if (balance.total === undefined && totalLimit !== undefined && balance.used !== undefined) {
      balance.total = totalLimit - balance.used
    }
    if (balance.total === undefined && balance.used === undefined && limitsPath === undefined) {
      throw new Error('response did not contain a balance or usage figure at the configured mapping paths')
    }
    const result: BalanceFetchResult = { balances: balance.total !== undefined || balance.used !== undefined ? [balance] : [] }
    if (limitsPath) result.limits = readLimits(doc, limitsPath)
    return result
  },
}

interface RawLimit {
  label?: unknown
  type?: unknown
  kind?: unknown
  used?: unknown
  total?: unknown
  remaining?: unknown
  percent?: unknown
  resetsAt?: unknown
}

/** Map a raw limits array onto LimitInfo rows, coercing numeric fields. */
function readLimits(doc: unknown, limitsPath: string): import('../types.js').LimitInfo[] {
  let node: unknown = doc
  for (const segment of limitsPath.split('.')) {
    if (node === null || typeof node !== 'object') return []
    node = (node as Record<string, unknown>)[segment]
  }
  if (!Array.isArray(node)) return []
  return node
    .filter((entry): entry is RawLimit => entry !== null && typeof entry === 'object')
    .map((entry) => {
      const kind = entry.kind === 'time' || entry.kind === 'requests' || entry.kind === 'credits' ? entry.kind : 'tokens'
      const limit: import('../types.js').LimitInfo = {
        label: String(entry.label ?? entry.type ?? 'limit'),
        kind,
      }
      const used = toNumber(entry.used)
      const total = toNumber(entry.total)
      const remaining = toNumber(entry.remaining)
      const percent = toNumber(entry.percent)
      const resetsAt = toNumber(entry.resetsAt)
      if (used !== undefined) limit.used = used
      if (total !== undefined) limit.total = total
      if (remaining !== undefined) limit.remaining = remaining
      if (percent !== undefined) limit.percent = percent
      if (resetsAt !== undefined) limit.resetsAt = resetsAt
      return limit
    })
}
