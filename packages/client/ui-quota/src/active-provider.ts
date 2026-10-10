/**
 * Tracks the LLM provider key of the model the main-view session currently
 * uses, so the quota UI can surface the matching provider row. Reads the
 * shared model directory of the session retained by the main view; cheap
 * local snapshots polled on a short interval avoid deep cross-session
 * subscription management.
 *
 * @module dsh-client-ui-quota/active-provider
 */

export interface ActiveProviderTracker {
  getProvider(): string | undefined
  subscribe(listener: () => void): () => void
  dispose(): void
}

interface SessionListSnapshot {
  byId: Record<string, { retainedBy?: Record<string, number | undefined> }>
}

interface ModelDirectoryStateLike {
  current?: { provider: string } | null
}

interface ActiveProviderContext {
  sessions?: { list: { getSnapshot(): SessionListSnapshot } }
  modelDirectories?: {
    directoryFor(sessionId: string): { store: { getSnapshot(): ModelDirectoryStateLike } }
  }
}

const POLL_MS = 5_000

export function createActiveProviderTracker(ctx: ActiveProviderContext): ActiveProviderTracker {
  let provider: string | undefined
  const listeners = new Set<() => void>()

  const compute = (): string | undefined => {
    try {
      const sessions = ctx.sessions
      const directories = ctx.modelDirectories
      if (!sessions || !directories) return undefined
      const summary = Object.entries(sessions.list.getSnapshot().byId).find(
        ([, session]) => (session.retainedBy?.['mainView'] ?? 0) > 0,
      )
      if (!summary) return undefined
      return directories.directoryFor(summary[0]).store.getSnapshot().current?.provider
    } catch {
      return undefined
    }
  }

  const tick = () => {
    const next = compute()
    if (next === provider) return
    provider = next
    for (const listener of listeners) listener()
  }

  const timer = setInterval(tick, POLL_MS)
  tick()

  return {
    getProvider: () => provider,
    subscribe(listener) {
      listeners.add(listener)
      listener()
      return () => listeners.delete(listener)
    },
    dispose: () => clearInterval(timer),
  }
}
