/**
 * Zhipu GLM / Z.ai Coding Plan quota endpoint:
 * GET {baseURL}/api/monitor/usage/quota/limit, answering `data.limits[]`
 * with the rolling 5-hour token window, the weekly window, and monthly tool
 * quotas of subscription plans.
 *
 * @module dsh-quota-monitor/fetchers/zai
 */
import type { BalanceFetcher, BalanceFetchRequest, BalanceFetchResult, LimitInfo } from '../types.js'
import { fetchJson, joinUrl } from './util.js'

interface ZaiLimitEntry {
  type?: string
  unit?: number
  number?: number
  usage?: number
  currentValue?: number
  remaining?: number
  percentage?: number
  nextResetTime?: number
  resetTime?: number
}

/** unit semantics from the z.ai frontend: 3 = 5-hour tokens, 6 = weekly, 5 = monthly tools. */
const UNIT_LABELS: Record<number, { label: string; kind: LimitInfo['kind'] }> = {
  3: { label: '5小时窗口', kind: 'tokens' },
  6: { label: '7天窗口', kind: 'tokens' },
  5: { label: '月度工具', kind: 'time' },
}

const UNIT_LABELS_EN: Record<number, { label: string; kind: LimitInfo['kind'] }> = {
  3: { label: '5-hour window', kind: 'tokens' },
  6: { label: '7-day window', kind: 'tokens' },
  5: { label: 'Monthly tools', kind: 'time' },
}

const num = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const zaiQuotaFetcher: BalanceFetcher = {
  kind: 'zai-quota',
  async fetch(request: BalanceFetchRequest): Promise<BalanceFetchResult> {
    const options = request.options
    const baseURL = request.baseURL ?? 'https://open.bigmodel.cn'
    const envName = typeof options['apiKeyEnv'] === 'string' ? options['apiKeyEnv'] : 'ZAI_API_KEY'
    const apiKey = await request.resolveKey(envName)
    if (!apiKey) throw new Error(`credential ${envName} is not configured`)
    const locale = options['locale'] === 'en' ? 'en' : 'zh'
    const labels = locale === 'en' ? UNIT_LABELS_EN : UNIT_LABELS
    const headers: Record<string, string> = {}
    if (typeof options['organization'] === 'string') headers['bigmodel-organization'] = options['organization']
    if (typeof options['project'] === 'string') headers['bigmodel-project'] = options['project']
    const type = options['type'] !== undefined ? `?type=${encodeURIComponent(String(options['type']))}` : ''
    const doc = (await fetchJson(joinUrl(baseURL, `/api/monitor/usage/quota/limit${type}`), {
      apiKey,
      headers,
      signal: request.signal,
    })) as { data?: { limits?: ZaiLimitEntry[] } }
    const entries = Array.isArray(doc.data?.limits) ? doc.data.limits : []
    const limits: LimitInfo[] = []
    for (const entry of entries) {
      const meta = entry.unit !== undefined ? labels[entry.unit] : undefined
      const used = num(entry.usage ?? entry.currentValue)
      const total = num(entry.number)
      const remaining = num(entry.remaining) ?? (used !== undefined && total !== undefined ? total - used : undefined)
      const percent = num(entry.percentage) ?? (used !== undefined && total ? (used / total) * 100 : undefined)
      const resetsAt = num(entry.nextResetTime ?? entry.resetTime)
      const limit: LimitInfo = {
        label: meta?.label ?? entry.type ?? `limit-${entry.unit ?? '?'}`,
        kind: meta?.kind ?? 'tokens',
      }
      if (used !== undefined) limit.used = used
      if (total !== undefined) limit.total = total
      if (remaining !== undefined) limit.remaining = remaining
      if (percent !== undefined) limit.percent = Math.round(percent * 10) / 10
      if (resetsAt !== undefined) limit.resetsAt = resetsAt
      limits.push(limit)
    }
    if (limits.length === 0) throw new Error('response contained no limits; check organization/project/type')
    return { limits }
  },
}
