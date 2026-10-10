/**
 * Settings section: one card per configured provider with balances, limit
 * windows, and a manual refresh.
 *
 * @module dsh-client-ui-quota/QuotaSection
 */
import React from 'react'
import type { QuotaSnapshot } from 'dsh-quota-monitor/types'
import type { QuotaStore } from './store.js'
import { balanceLine, limitLine, stateColor, stateKey, type Translate } from './view.js'

export interface QuotaSectionProps {
  store: QuotaStore
  t: Translate
}

export function QuotaSection({ store, t }: QuotaSectionProps): React.JSX.Element {
  const [snapshot, setSnapshot] = React.useState<QuotaSnapshot | undefined>(() => store.getSnapshot())
  const [status, setStatus] = React.useState(() => store.getStatus())
  const [refreshing, setRefreshing] = React.useState<string | 'all' | undefined>()
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(
    () =>
      store.subscribe(() => {
        setSnapshot(store.getSnapshot())
        setStatus(store.getStatus())
      }),
    [store],
  )
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const refresh = async (providerId?: string) => {
    setRefreshing(providerId ?? 'all')
    try {
      await store.refresh(providerId)
    } finally {
      setRefreshing(undefined)
    }
  }

  if (!snapshot || snapshot.providers.length === 0) {
    return (
      <section aria-label={t('title')} style={{ padding: '16px', color: 'var(--dsh-muted, #9ca3af)' }}>
        {status.kind === 'loading' && t('statePending')}
        {status.kind === 'error' && (
          <p role="alert" style={{ color: 'var(--dsh-danger, #ef4444)' }}>
            {t('errorLabel')}: {status.message}
          </p>
        )}
        {status.kind === 'ready' && t('empty')}
      </section>
    )
  }

  return (
    <section aria-label={t('title')} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>{t('title')}</h3>
        <button type="button" disabled={refreshing !== undefined} onClick={() => void refresh()}>
          {refreshing === 'all' ? t('refreshing') : t('refresh')}
        </button>
      </header>
      {snapshot.providers.map((row) => (
        <article
          key={row.id}
          style={{
            border: '1px solid var(--dsh-border, #e5e7eb)',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden
              style={{ width: 8, height: 8, borderRadius: '50%', background: stateColor(row.state), flexShrink: 0 }}
            />
            <strong style={{ flex: 1 }}>{row.label}</strong>
            <span style={{ color: stateColor(row.state), fontSize: 12 }}>
              {t(stateKey(row.state))}
              {row.stale ? t('stale') : ''}
            </span>
            <button
              type="button"
              disabled={refreshing !== undefined || row.state === 'disabled' || row.state === 'unsupported'}
              onClick={() => void refresh(row.id)}
              aria-label={`${t('refresh')} ${row.label}`}
            >
              {refreshing === row.id ? t('refreshing') : t('refresh')}
            </button>
          </header>
          {row.balances.map((balance, index) => (
            <p key={`b${index}`} style={{ margin: 0, fontSize: 13 }}>
              {balanceLine(balance, t)}
            </p>
          ))}
          {row.limits.map((limit, index) => (
            <LimitRow key={`l${index}`} limit={limit} t={t} now={now} />
          ))}
          {row.state === 'error' && row.error !== undefined && (
            <p role="alert" style={{ margin: 0, fontSize: 12, color: 'var(--dsh-danger, #ef4444)' }}>
              {t('errorLabel')}: {row.error}
            </p>
          )}
          <footer style={{ fontSize: 12, color: 'var(--dsh-muted, #9ca3af)' }}>
            {row.fetchedAt !== undefined
              ? `${t('refreshedAt')} ${new Date(row.fetchedAt).toLocaleTimeString()}`
              : t('never')}
          </footer>
        </article>
      ))}
    </section>
  )
}

function LimitRow({ limit, t, now }: { limit: import('dsh-quota-monitor/types').LimitInfo; t: Translate; now: number }): React.JSX.Element {
  const percent = limit.percent
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <p style={{ margin: 0, fontSize: 13 }}>{limitLine(limit, t, now)}</p>
      {percent !== undefined && (
        <div
          role="progressbar"
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={limit.label}
          style={{ height: 4, borderRadius: 2, background: 'var(--dsh-border, #e5e7eb)', overflow: 'hidden' }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, percent)}%`,
              background: percent >= 80 ? 'var(--dsh-danger, #ef4444)' : percent >= 50 ? 'var(--dsh-warning, #eab308)' : 'var(--dsh-success, #22c55e)',
            }}
          />
        </div>
      )}
    </div>
  )
}
