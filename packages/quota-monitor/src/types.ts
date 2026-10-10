/**
 * Shared wire vocabulary for the quota monitor: snapshots crossing the Remote
 * boundary and the fetcher contract adapters implement.
 *
 * @module dsh-quota-monitor/types
 */

/** One monetary balance line of a provider account. */
export interface BalanceInfo {
  /** ISO-ish currency tag reported by the provider, such as `CNY` or `USD`. */
  currency: string
  /** Remaining total balance, when the endpoint reports it. */
  total?: number
  /** Remaining granted (free) balance. */
  granted?: number
  /** Remaining topped-up (paid) balance. */
  toppedUp?: number
  /** Consumed amount, for endpoints that report usage instead of balance. */
  used?: number
}

/**
 * One rate-limit window of a subscription plan (智谱/Kimi/MiniMax 等订阅套餐
 * 的 5 小时与 7 天滚动窗口、月度工具额度等)。
 */
export interface LimitInfo {
  /** Display label, such as `5小时窗口` / `7天窗口` / `月度工具`. */
  label: string
  /** What the window meters. */
  kind: 'tokens' | 'time' | 'requests' | 'credits'
  /** Consumed amount in the current window. */
  used?: number
  /** Window capacity. */
  total?: number
  /** Remaining amount in the current window. */
  remaining?: number
  /** used/total as 0–100; authoritative when the endpoint reports it. */
  percent?: number
  /** ms epoch when the window resets; clients render a countdown. */
  resetsAt?: number
}

/** Presentation state of one provider row. */
export type QuotaState =
  /** Last fetch succeeded and every balance is above the warn threshold. */
  | 'ok'
  /** Last fetch succeeded and at least one balance is at or below the warn threshold. */
  | 'warn'
  /** Last fetch failed; `error` carries the diagnostic. */
  | 'error'
  /** The provider kind has no balance endpoint (fetcher `none`). */
  | 'unsupported'
  /** No fetch has completed yet. */
  | 'pending'
  /** The row is configured off. */
  | 'disabled'

/** Quota facts for one configured provider. */
export interface ProviderQuota {
  /** Configured provider id. */
  id: string
  /** Display label. */
  label: string
  state: QuotaState
  /** Balance lines for prepaid accounts. */
  balances: BalanceInfo[]
  /** Rate-limit windows for subscription plans. */
  limits: LimitInfo[]
  /** Diagnostic for `error` rows. */
  error?: string
  /** Warn threshold copied from config, so the client can render it. */
  warnThreshold?: number
  /** True when balances come from an earlier successful fetch (current attempt failed). */
  stale?: boolean
  /** ms epoch of the fetch that produced `balances`; absent while pending. */
  fetchedAt?: number
}

/** Whole-service snapshot crossing the wire. */
export interface QuotaSnapshot {
  /** ms epoch when this snapshot was assembled. */
  fetchedAt: number
  providers: ProviderQuota[]
}

/** Facts a fetcher receives for one refresh; secret material stays Host-side. */
export interface BalanceFetchRequest {
  /** Base URL of the provider endpoint, without a trailing slash. */
  baseURL?: string
  /** Extra provider config the fetcher declared in its `configFields`. */
  options: Record<string, unknown>
  /** Resolve an environment-variable credential reference to its value. */
  resolveKey: (envName: string) => Promise<string | undefined>
  /** Abort signal bound to the configured fetch timeout. */
  signal: AbortSignal
}

/** Successful fetch result for one provider. */
export interface BalanceFetchResult {
  balances?: BalanceInfo[]
  limits?: LimitInfo[]
}

/**
 * Pluggable balance fetcher. Built-ins: `deepseek-balance`, `zai-quota`,
 * `generic-http`, `none`. Third-party plugins register more through
 * `ctx.quotaMonitor.registerFetcher`.
 */
export interface BalanceFetcher {
  /** Config `fetcher` value selecting this adapter. */
  readonly kind: string
  /** Fetch current balances; throw to mark the row `error`. */
  fetch(request: BalanceFetchRequest): Promise<BalanceFetchResult>
}
