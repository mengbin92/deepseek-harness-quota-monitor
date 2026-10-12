/* Hand-maintained Typert artifacts for the `quota` namespace. Official
 * packages generate these with dsh-typert-generator; the shapes below mirror
 * that output: the host face (`TYPERT`) is validated and registered by
 * dsh-typert-loader, the client contribution (`TYPERT_REMOTE`) is mounted
 * through `ctx.remote.$mount`.
 */
import { z } from 'zod'

const balanceInfoSchema = () =>
  z.object({
    currency: z.string(),
    total: z.number().optional(),
    granted: z.number().optional(),
    toppedUp: z.number().optional(),
    used: z.number().optional(),
  })

const limitInfoSchema = () =>
  z.object({
    label: z.string(),
    kind: z.union([z.literal('tokens'), z.literal('time'), z.literal('requests'), z.literal('credits')]),
    used: z.number().optional(),
    total: z.number().optional(),
    remaining: z.number().optional(),
    percent: z.number().optional(),
    resetsAt: z.number().optional(),
  })

const providerQuotaSchema = () =>
  z.object({
    id: z.string(),
    label: z.string(),
    state: z.union([
      z.literal('ok'),
      z.literal('warn'),
      z.literal('error'),
      z.literal('unsupported'),
      z.literal('pending'),
      z.literal('disabled'),
    ]),
    balances: z.array(balanceInfoSchema()),
    limits: z.array(limitInfoSchema()),
    error: z.string().optional(),
    warnThreshold: z.number().optional(),
    pinned: z.boolean().optional(),
    llmProviders: z.array(z.string()).optional(),
    stale: z.boolean().optional(),
    fetchedAt: z.number().optional(),
  })

const quotaSnapshotSchema = () =>
  z.object({
    fetchedAt: z.number(),
    providers: z.array(providerQuotaSchema()),
  })

const providerIdParameterSchema = () => z.union([z.undefined(), z.string()])

const snapshotInvocation = {
  id: 'dsh-quota-monitor#quota/snapshot',
  service: 'quotaMonitor',
  namespace: 'quota',
  method: 'snapshot',
  invocation: { kind: 'direct' },
  parameters: [],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-quota-monitor/types#QuotaSnapshot',
    create: quotaSnapshotSchema,
  },
  sourceLocation: { file: 'packages/quota-monitor/src/index.ts', line: 142, column: 3 },
}

const refreshInvocation = {
  id: 'dsh-quota-monitor#quota/refresh',
  service: 'quotaMonitor',
  namespace: 'quota',
  method: 'refresh',
  invocation: { kind: 'direct' },
  parameters: [
    {
      name: 'providerId',
      wire: 'providerId',
      source: 'json',
      acceptsUndefined: true,
      codec: {
        mode: 'strict',
        typeSymbol: 'dsh-quota-monitor#quota/refresh:providerId',
        create: providerIdParameterSchema,
      },
    },
  ],
  result: {
    mode: 'strict',
    typeSymbol: 'dsh-quota-monitor/types#QuotaSnapshot',
    create: quotaSnapshotSchema,
  },
  sourceLocation: { file: 'packages/quota-monitor/src/index.ts', line: 158, column: 3 },
}

const serviceDoc = {
  description:
    'Host service backing the `quota` Remote namespace: periodic provider-balance and subscription-window refresh over pluggable fetchers, with the last assembled snapshot served to browsers.',
  summary: 'Periodic provider quota monitor with a Remote snapshot and refresh.',
  tags: [],
  jsDoc:
    '/**\n * Periodic balance monitor. The service owns the fetch schedule and the last\n' +
    ' * known snapshot; every consumer reads the assembled snapshot, so a burst of\n' +
    ' * client polls never multiplies provider traffic.\n */',
}

/** Host-face artifact consumed by dsh-typert-loader's `./typert` export probe. */
export const TYPERT = {
  package: 'dsh-quota-monitor',
  face: 'host',
  schemas: [],
  invocations: [snapshotInvocation, refreshInvocation],
  model: {
    services: [
      {
        ...serviceDoc,
        key: 'quotaMonitor',
        exportName: 'QuotaMonitor',
        members: [
          {
            kind: 'method',
            name: 'snapshot',
            signature: '@Remote snapshot(): QuotaSnapshot',
            summary: 'Read the last assembled snapshot without touching the network.',
            jsDoc:
              '/**\n * Read the last assembled snapshot without touching the network.\n' +
              ' * @returns the complete provider row set as of the last refresh.\n */',
          },
          {
            kind: 'method',
            name: 'refresh',
            signature: '@Remote async refresh(providerId?: string): Promise<QuotaSnapshot>',
            summary: 'Refresh every enabled provider, or one named provider.',
            jsDoc:
              '/**\n * Refresh every enabled provider, or one provider when `providerId` names a\n' +
              ' * configured row. Never throws: failures fold into row state.\n' +
              ' * @param providerId - optional configured provider key.\n' +
              ' * @returns the snapshot after the targeted refreshes settle.\n */',
          },
        ],
        types: [
          {
            name: 'BalanceInfo',
            declaration:
              'export interface BalanceInfo { currency: string; total?: number; granted?: number; toppedUp?: number; used?: number }',
          },
          {
            name: 'LimitInfo',
            declaration:
              "export interface LimitInfo { label: string; kind: 'tokens' | 'time' | 'requests' | 'credits'; used?: number; total?: number; remaining?: number; percent?: number; resetsAt?: number }",
          },
          {
            name: 'ProviderQuota',
            declaration:
              "export interface ProviderQuota { id: string; label: string; state: 'ok' | 'warn' | 'error' | 'unsupported' | 'pending' | 'disabled'; balances: BalanceInfo[]; limits: LimitInfo[]; error?: string; warnThreshold?: number; pinned?: boolean; llmProviders?: string[]; stale?: boolean; fetchedAt?: number }",
          },
          {
            name: 'QuotaSnapshot',
            declaration:
              'export interface QuotaSnapshot { fetchedAt: number; providers: ProviderQuota[] }',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}

/** Client contribution mounted through `ctx.remote.$mount`. */
export const TYPERT_REMOTE = {
  package: 'dsh-quota-monitor',
  descriptors: [snapshotInvocation, refreshInvocation],
}
