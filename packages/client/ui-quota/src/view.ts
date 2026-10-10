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

export function limitLine(limit: LimitInfo, t: Translate, now: number): string {
  const unit = t(`windowUnit.${limit.kind}`)
  const parts: string[] = [limit.label]
  if (limit.percent !== undefined) parts.push(`${Math.round(limit.percent)}%`)
  else if (limit.used !== undefined && limit.total) parts.push(`${formatAmount(limit.used)}/${formatAmount(limit.total)} ${unit}`)
  else if (limit.remaining !== undefined) parts.push(`${formatAmount(limit.remaining)} ${unit}`)
  if (limit.resetsAt !== undefined) parts.push(`${formatResetCountdown(limit.resetsAt, now)} ${t('resetsIn')}`)
  return parts.join(' · ')
}

/** One-line summary for tooltips and the sidebar indicator. */
export function rowSummary(row: ProviderQuota, t: Translate, now: number): string {
  if (row.state === 'error') return `${row.label}: ${t('stateError')}${row.stale ? t('stale') : ''}`
  if (row.state !== 'ok' && row.state !== 'warn') return `${row.label}: ${t(stateKey(row.state))}`
  const parts: string[] = []
  if (row.balances[0]?.total !== undefined) parts.push(`${formatAmount(row.balances[0].total)} ${row.balances[0].currency}`)
  const worstLimit = row.limits
    .filter((limit) => limit.percent !== undefined)
    .sort((a, b) => (b.percent ?? 0) - (a.percent ?? 0))[0]
  if (worstLimit) parts.push(`${worstLimit.label} ${Math.round(worstLimit.percent ?? 0)}%`)
  return `${row.label}: ${parts.join(' · ') || t('stateOk')}`
}
