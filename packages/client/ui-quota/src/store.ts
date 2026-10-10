/**
 * Client-side quota snapshot store: baseline read on mount, 60s polling, and
 * manual refresh. Primary transport is the Typert Remote namespace `quota`;
 * when the namespace is not mounted (older host, mount failure), reads fall
 * back to the Gateway's plain HTTP wire format on the same origin.
 *
 * @module dsh-client-ui-quota/store
 */
import type { QuotaSnapshot } from 'dsh-quota-monitor/types'

export type QuotaRemote = {
  quota?: {
    snapshot(): Promise<QuotaSnapshot>
    refresh(providerId?: string): Promise<QuotaSnapshot>
  }
}

/** Lazily yields the mounted quota namespace, or undefined before mount. */
export type NamespaceAccessor = () => NonNullable<QuotaRemote['quota']> | undefined

/** Store readiness, surfaced in the UI instead of a misleading empty list. */
export type QuotaStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

type Listener = () => void

export interface QuotaStore {
  getSnapshot(): QuotaSnapshot | undefined
  getStatus(): QuotaStatus
  /** True once a call succeeded through the quota Remote namespace. */
  isRemoteMounted(): boolean
  subscribe(listener: Listener): () => void
  refresh(providerId?: string): Promise<void>
  /** Start polling; returns the stop function. */
  start(): () => void
}

const POLL_INTERVAL_MS = 60_000

interface WireResponse {
  result?: { ok: boolean; value?: QuotaSnapshot; error?: { code: string; message: string } }
}

/** Gateway HTTP wire format, verified against dsh-api-gateway. */
async function wireCall(method: 'quota/snapshot' | 'quota/refresh', args: Record<string, unknown>): Promise<QuotaSnapshot> {
  const response = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: `quota-${Date.now()}`, method, payload: { args } }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body = (await response.json()) as WireResponse
  if (body.result?.ok !== true || body.result.value === undefined) {
    throw new Error(body.result?.error?.message ?? 'empty gateway response')
  }
  return body.result.value
}

/**
 * Typed namespace calls resolve to the RemoteResult envelope
 * `{ ok: true, value } | { ok: false, error }`, not the bare business value
 * (see ClientRemoteService.invoke). Unwrap it or throw the remote failure.
 */
function unwrapRemote(result: unknown): QuotaSnapshot {
  if (result !== null && typeof result === 'object' && 'ok' in result) {
    const envelope = result as { ok: boolean; value?: QuotaSnapshot; error?: { code?: string; message?: string } }
    if (envelope.ok === true && envelope.value !== undefined) return envelope.value
    throw new Error(envelope.error?.message ?? 'remote call failed')
  }
  return result as QuotaSnapshot
}

export function createQuotaStore(getNamespace: NamespaceAccessor): QuotaStore {
  let snapshot: QuotaSnapshot | undefined
  let status: QuotaStatus = { kind: 'loading' }
  let remoteMounted = false
  const listeners = new Set<Listener>()
  let timer: ReturnType<typeof setInterval> | undefined
  let inFlight: Promise<void> | undefined

  const publish = (next: QuotaSnapshot | undefined, nextStatus?: QuotaStatus) => {
    snapshot = next
    if (nextStatus !== undefined) status = nextStatus
    for (const listener of listeners) listener()
  }

  const call = (method: 'quota/snapshot' | 'quota/refresh', providerId?: string): Promise<QuotaSnapshot> => {
    const namespace = getNamespace()
    if (namespace) {
      return method === 'quota/snapshot'
        ? namespace.snapshot().then(unwrapRemote)
        : namespace.refresh(providerId).then(unwrapRemote)
    }
    return wireCall(method, providerId === undefined ? {} : { providerId })
  }

  const pull = async (): Promise<void> => {
    inFlight ??= call('quota/snapshot')
      .then((next) => {
        if (getNamespace()) remoteMounted = true
        publish(next, { kind: 'ready' })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('dsh-client-ui-quota: quota/snapshot failed', error)
        publish(snapshot, { kind: 'error', message })
      })
      .finally(() => {
        inFlight = undefined
      })
    return inFlight
  }

  return {
    getSnapshot: () => snapshot,
    getStatus: () => status,
    isRemoteMounted: () => remoteMounted,
    subscribe(listener) {
      listeners.add(listener)
      listener()
      return () => listeners.delete(listener)
    },
    async refresh(providerId) {
      try {
        const next = await call('quota/refresh', providerId)
        if (getNamespace()) remoteMounted = true
        publish(next, { kind: 'ready' })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('dsh-client-ui-quota: quota/refresh failed', error)
        publish(snapshot, { kind: 'error', message })
      }
    },
    start() {
      void pull()
      timer = setInterval(() => void pull(), POLL_INTERVAL_MS)
      return () => {
        if (timer !== undefined) clearInterval(timer)
        timer = undefined
      }
    },
  }
}
