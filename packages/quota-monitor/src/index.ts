/**
 * Quota monitor service (`ctx.quotaMonitor`): periodic provider-balance
 * refresh over pluggable fetchers, exposed to the web client through the
 * Typert Remote namespace `quota`.
 *
 * @module dsh-quota-monitor
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialRef, isCredentialRefName } from '@deepseek-ai/dsh-credentials'
import type {
  BalanceFetcher,
  LimitInfo,
  ProviderQuota,
  QuotaSnapshot,
  QuotaState,
} from './types.js'
import { deepseekBalanceFetcher } from './fetchers/deepseek.js'
import { genericHttpFetcher } from './fetchers/generic-http.js'
import { zaiQuotaFetcher } from './fetchers/zai.js'
import { neoGatewayFetcher } from './fetchers/neo-gateway.js'

export type * from './types.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    quotaMonitor: QuotaMonitor
  }
}

interface ProviderConfig {
  id: string
  label?: string
  fetcher?: string
  enabled?: boolean
  hidden?: boolean
  order?: number
  pinned?: boolean
  llmProviders?: string[]
  baseURL?: string
  warnThreshold?: number
  [key: string]: unknown
}

interface QuotaMonitorConfig {
  refreshIntervalMinutes: number
  timeoutMs: number
  providers: ProviderConfig[]
}

/**
 * Periodic balance monitor. The service owns the fetch schedule and the last
 * known snapshot; every consumer reads the assembled snapshot, so a burst of
 * client polls never multiplies provider traffic.
 *
 * Timer handles come from `cordis-plugin-timer` (composed by every shipped
 * profile), so they dispose with this plugin's fiber. The optional
 * `credentials` service resolves `apiKeyEnv` references; without it every
 * credentialed fetcher reports its key as unconfigured.
 */
export class QuotaMonitor extends TypertRemoteService {
  static Config: z<QuotaMonitorConfig> = z.object({
    refreshIntervalMinutes: z.number().min(1).default(30).description('Minutes between automatic balance refreshes.'),
    timeoutMs: z.number().min(1000).default(10_000).description('Per-provider fetch timeout in milliseconds.'),
    providers: z
      .array(
        z.object({
          id: z.string().description('Stable provider key; unique within this list.'),
          label: z.string().description('Display label; defaults to id.'),
          fetcher: z
            .string()
            .default('deepseek-balance')
            .description("Fetcher kind: 'deepseek-balance', 'zai-quota', 'neo-gateway', 'generic-http', 'none', or a registered third-party kind."),
          enabled: z.boolean().default(true).description('Set false to keep the row without fetching it.'),
          hidden: z.boolean().default(false).description('Set true to drop the provider from snapshots entirely (no card, no sidebar entry, no fetching).'),
          order: z.number().description('Card ordering on the quota page; lower sorts first, ties keep config order.'),
          pinned: z.boolean().default(false).description('Prefer this provider for the sidebar indicator instead of the worst-state row.'),
          llmProviders: z.array(z.string()).description('LLM provider keys (from the session model selection) this row answers for; the UI surfaces the row matching the model currently in use.'),
          baseURL: z.string().description('Provider endpoint base URL.'),
          warnThreshold: z.number().description('Warn when any balance drops to or below this amount, or any limit window reaches this percent.'),
        }).loose(),
      )
      .default([]),
  })

  static inject = ['timer']

  private readonly fetchers = new Map<string, BalanceFetcher>()
  /** Visible providers in display order, deduplicated by id. */
  private readonly providers: ProviderConfig[]
  /** In-flight refresh per provider id: concurrent triggers share one fetch. */
  private readonly inflight = new Map<string, Promise<void>>()
  private rows: ProviderQuota[]

  constructor(
    ctx: Context,
    public config: QuotaMonitorConfig,
  ) {
    super(ctx, 'quotaMonitor', { namespace: 'quota' })
    this.fetchers.set(deepseekBalanceFetcher.kind, deepseekBalanceFetcher)
    this.fetchers.set(genericHttpFetcher.kind, genericHttpFetcher)
    this.fetchers.set(zaiQuotaFetcher.kind, zaiQuotaFetcher)
    this.fetchers.set(neoGatewayFetcher.kind, neoGatewayFetcher)
    const seen = new Set<string>()
    this.providers = this.sorted(config.providers.filter((provider) => provider.hidden !== true)).filter(
      (provider) => {
        if (seen.has(provider.id)) {
          console.warn(`dsh-quota-monitor: duplicate provider id '${provider.id}' ignored`)
          return false
        }
        seen.add(provider.id)
        return true
      },
    )
    this.rows = this.providers.map((provider) => this.pendingRow(provider))
    // ctx.setInterval comes from cordis-plugin-timer, mounted by every
    // shipped profile; the handle disposes with this fiber.
    ;(ctx as unknown as { setInterval(cb: () => void, ms: number): void }).setInterval(
      () => void this.refresh(),
      config.refreshIntervalMinutes * 60_000,
    )
    // 'ready' fires once the composition finishes mounting; fetch immediately
    // rather than waiting one whole interval for the first snapshot.
    ;(ctx as unknown as { on(event: string, cb: () => void): void }).on('ready', () => void this.refresh())
  }

  /**
   * Register or replace a balance fetcher; returns its disposer, which
   * withdraws the kind. Rows already configured with the kind flip to
   * `error` on their next refresh.
   */
  registerFetcher(fetcher: BalanceFetcher): () => void {
    this.fetchers.set(fetcher.kind, fetcher)
    return () => {
      this.fetchers.delete(fetcher.kind)
    }
  }

  /** Read the last assembled snapshot without touching the network. */
  @Remote
  snapshot(): QuotaSnapshot {
    return {
      fetchedAt: Date.now(),
      providers: this.rows.map((row) => ({
        ...row,
        balances: row.balances.map((line) => ({ ...line })),
        limits: row.limits.map((limit) => ({ ...limit })),
      })),
    }
  }

  /**
   * Refresh every enabled provider, or one provider when `providerId` names a
   * configured row. Never throws: failures fold into row state.
   */
  @Remote
  async refresh(providerId?: string): Promise<QuotaSnapshot> {
    const targets = this.providers.filter((provider) => providerId === undefined || provider.id === providerId)
    await Promise.all(targets.map((provider) => this.refreshOne(provider)))
    return this.snapshot()
  }

  /** Visible providers in display order: `order` ascending, ties keep config order. */
  private sorted(providers: ProviderConfig[]): ProviderConfig[] {
    return providers
      .map((provider, index) => ({ provider, index }))
      .sort((a, b) => (a.provider.order ?? 0) - (b.provider.order ?? 0) || a.index - b.index)
      .map((entry) => entry.provider)
  }

  private pendingRow(provider: ProviderConfig): ProviderQuota {
    const base: ProviderQuota = {
      id: provider.id,
      label: provider.label ?? provider.id,
      state: 'pending',
      balances: [],
      limits: [],
    }
    if (provider.warnThreshold !== undefined) base.warnThreshold = provider.warnThreshold
    if (provider.pinned === true) base.pinned = true
    if (provider.llmProviders !== undefined) base.llmProviders = provider.llmProviders
    if (provider.enabled === false) base.state = 'disabled'
    else if ((provider.fetcher ?? 'deepseek-balance') === 'none') base.state = 'unsupported'
    return base
  }

  /**
   * Refresh one provider, deduplicating concurrent triggers: the periodic
   * timer and a manual client refresh racing each other share the same
   * fetch, so a slower stale attempt can never overwrite a newer result.
   */
  private refreshOne(provider: ProviderConfig): Promise<void> {
    const existing = this.inflight.get(provider.id)
    if (existing) return existing
    // runFetch never rejects; every failure folds into the row state.
    const task = this.runFetch(provider).finally(() => {
      this.inflight.delete(provider.id)
    })
    this.inflight.set(provider.id, task)
    return task
  }

  private async runFetch(provider: ProviderConfig): Promise<void> {
    if (provider.enabled === false) {
      this.store(this.pendingRow(provider))
      return
    }
    const kind = provider.fetcher ?? 'deepseek-balance'
    if (kind === 'none') {
      this.store(this.pendingRow(provider))
      return
    }
    const fetcher = this.fetchers.get(kind)
    const previous = this.rows.find((row) => row.id === provider.id)
    if (!fetcher) {
      this.store({
        ...this.pendingRow(provider),
        state: 'error',
        error: `no balance fetcher registered for kind '${kind}'`,
      })
      return
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs)
    try {
      const { balances = [], limits = [] } = await fetcher.fetch({
        baseURL: provider.baseURL,
        options: provider,
        signal: controller.signal,
        resolveKey: async (envName) => {
          if (!isCredentialRefName(envName)) return undefined
          const resolved = await this.ctx.get('credentials')?.resolve(credentialRef(envName))
          return resolved?.value
        },
      })
      const state: QuotaState = this.isWarn(balances, limits, provider.warnThreshold) ? 'warn' : 'ok'
      this.store({
        ...this.pendingRow(provider),
        state,
        balances,
        limits,
        fetchedAt: Date.now(),
      })
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      const row: ProviderQuota = {
        ...this.pendingRow(provider),
        state: 'error',
        balances: previous?.balances ?? [],
        limits: previous?.limits ?? [],
        error: message,
        stale: previous?.fetchedAt !== undefined,
      }
      if (previous?.fetchedAt !== undefined) row.fetchedAt = previous.fetchedAt
      this.store(row)
    } finally {
      clearTimeout(timeout)
    }
  }

  private isWarn(
    balances: { total?: number }[],
    limits: LimitInfo[],
    threshold: number | undefined,
  ): boolean {
    if (threshold === undefined) return false
    if (balances.some((line) => line.total !== undefined && line.total <= threshold)) return true
    return limits.some((limit) => limit.percent !== undefined && limit.percent >= threshold)
  }

  private store(row: ProviderQuota): void {
    const index = this.rows.findIndex((existing) => existing.id === row.id)
    if (index === -1) this.rows.push(row)
    else this.rows[index] = row
  }
}

export default QuotaMonitor
