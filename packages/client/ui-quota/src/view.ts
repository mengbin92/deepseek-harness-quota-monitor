/**
 * Shared formatting helpers and per-row presentation for the quota UI.
 *
 * @module dsh-client-ui-quota/view
 */
import type { BalanceInfo, LimitInfo, ProviderQuota } from 'dsh-quota-monitor/types'

export type Translate = (key: string, params?: Record<string, string>) => string

export const stateColor = (state: ProviderQuota['state']): string =>
  state === 'ok' ? 'var(--dsh-success, #22c55e)'
  : state === 'warn' ? 'var(--dsh-warning, #eab308)'
  : state === 'error' ? 'var(--dsh-danger, #ef4444)'
  : 'var(--dsh-muted, #9ca3af)'

export const stateKey = (state: ProviderQuota['state']): string =>
  state === 'ok' ? 'stateOk'
  : state === 'warn' ? 'stateWarn'
  : state === 'error' ? 'stateError'
  : state === 'unsupported' ? 'stateUnsupported'
  : state === 'disabled' ? 'stateDisabled'
  : 'statePending'

export function formatAmount(value: number): string {
  if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(1)}亿`
  if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(1)}万`
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function formatResetCountdown(resetsAt: number, now: number): string {
  const ms = Math.max(0, resetsAt - now)
  const minutes = Math.floor(ms / 60_000)
  if (minutes >= 60 * 24) return `${Math.floor(minutes / (60 * 24))}d${Math.floor((minutes % (60 * 24)) / 60)}h`
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h${minutes % 60}m`
  return `${minutes}m`
}

export function balanceLine(balance: BalanceInfo, t: Translate): string {
  const parts: string[] = []
  if (balance.total !== undefined) parts.push(`${t('balance')} ${formatAmount(balance.total)} ${balance.currency}`)
  if (balance.granted !== undefined) parts.push(`${t('granted')} ${formatAmount(balance.granted)}`)
  if (balance.toppedUp !== undefined) parts.push(`${t('toppedUp')} ${formatAmount(balance.toppedUp)}`)
  if (balance.used !== undefined) parts.push(`${t('used')} ${formatAmount(balance.used)}`)
  return parts.join(' · ')
}

/**
 * Remaining percentage of one limit window (0–100), following cc-switch's
 * "always show remaining" convention: prefer the endpoint-reported remaining
 * figure, fall back to 100 − used-percent.
 */
export function limitRemaining(limit: LimitInfo): number | undefined {
  if (limit.remaining !== undefined && limit.total) {
    return Math.max(0, Math.min(100, Math.round((limit.remaining / limit.total) * 1000) / 10))
  }
  if (limit.percent !== undefined) return Math.max(0, Math.round((100 - limit.percent) * 10) / 10)
  if (limit.used !== undefined && limit.total) {
    return Math.max(0, Math.round(((limit.total - limit.used) / limit.total) * 1000) / 10)
  }
  return undefined
}

/** Tone by remaining: exhausted → red, below 20% → yellow, else green. */
export function remainingTone(remaining: number): 'danger' | 'warning' | 'normal' {
  if (remaining <= 0) return 'danger'
  if (remaining < 20) return 'warning'
  return 'normal'
}

export const toneColor = (tone: 'danger' | 'warning' | 'normal'): string =>
  tone === 'danger' ? 'var(--dsh-danger, #ef4444)'
  : tone === 'warning' ? 'var(--dsh-warning, #eab308)'
  : 'var(--dsh-success, #22c55e)'

export function limitLine(limit: LimitInfo, t: Translate, now: number): string {
  const unit = t(`windowUnit.${limit.kind}`)
  const parts: string[] = [limit.label]
  const remaining = limitRemaining(limit)
  if (remaining !== undefined) parts.push(remaining <= 0 ? t('usedUp') : `${t('left')} ${Math.round(remaining)}%`)
  else if (limit.remaining !== undefined) parts.push(`${t('left')} ${formatAmount(limit.remaining)} ${unit}`)
  if (limit.resetsAt !== undefined) parts.push(`${formatResetCountdown(limit.resetsAt, now)} ${t('resetsIn')}`)
  return parts.join(' · ')
}

/** Short form of a window label: the segment after the last '·' ('日额度'). */
export function shortWindowLabel(label: string): string {
  const segments = label.split('·').map((part) => part.trim()).filter(Boolean)
  return segments[segments.length - 1] ?? label
}

/**
 * One-line summary for tooltips and the sidebar indicator. Rows with
 * subscription windows show only the shortest window (nearest reset — the
 * neo daily quota, the z.ai 5-hour window), following cc-switch's
 * shortest-window-first rule; balance-only rows show the balance.
 */
export function rowSummary(row: ProviderQuota, t: Translate, now: number): string {
  if (row.state === 'error') return `${row.label}: ${t('stateError')}${row.stale ? t('stale') : ''}`
  if (row.state !== 'ok' && row.state !== 'warn') return `${row.label}: ${t(stateKey(row.state))}`
  const windows = row.limits
    .map((limit) => ({ limit, remaining: limitRemaining(limit) }))
    .filter((entry): entry is { limit: LimitInfo; remaining: number } => entry.remaining !== undefined)
  if (windows.length > 0) {
    const shortest = windows.sort(
      (a, b) => (a.limit.resetsAt ?? Number.POSITIVE_INFINITY) - (b.limit.resetsAt ?? Number.POSITIVE_INFINITY),
    )[0]
    return `${row.label}: ${shortWindowLabel(shortest.limit.label)} ${t('left')} ${Math.round(shortest.remaining)}%`
  }
  if (row.balances[0]?.total !== undefined) {
    return `${row.label}: ${formatAmount(row.balances[0].total)} ${row.balances[0].currency}`
  }
  return `${row.label}: ${t('stateOk')}`
}
