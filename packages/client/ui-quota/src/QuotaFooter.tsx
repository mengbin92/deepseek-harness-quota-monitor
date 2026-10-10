/**
 * Sidebar footer indicator: a compact dot summarizing the worst provider
 * state, with a tooltip listing every row and a click through to the Quota
 * settings section.
 *
 * @module dsh-client-ui-quota/QuotaFooter
 */
import React from 'react'
import type { QuotaSnapshot, ProviderQuota } from 'dsh-quota-monitor/types'
import type { QuotaStore } from './store.js'
import { rowSummary, stateColor, type Translate } from './view.js'

export interface QuotaFooterProps {
  store: QuotaStore
  t: Translate
  /** Shell-supplied column state: labels render only when the sidebar is wide. */
  wide?: boolean
  /** Open the settings panel on the quota section. */
  openSettings?: () => void
}

const rank = (state: ProviderQuota['state']): number =>
  state === 'error' ? 3 : state === 'warn' ? 2 : state === 'ok' ? 1 : 0

export function QuotaFooter({ store, t, wide, openSettings }: QuotaFooterProps): React.JSX.Element | null {
  const [snapshot, setSnapshot] = React.useState<QuotaSnapshot | undefined>(() => store.getSnapshot())
  React.useEffect(() => store.subscribe(() => setSnapshot(store.getSnapshot())), [store])

  const rows = snapshot?.providers ?? []
  if (rows.length === 0) return null

  const worst = rows.reduce((a, b) => (rank(b.state) > rank(a.state) ? b : a))
  const now = Date.now()
  const tooltip = [t('footerTooltipTitle'), ...rows.map((row) => rowSummary(row, t, now))].join('\n')

  return (
    <button
      type="button"
      title={tooltip}
      onClick={openSettings}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'none',
        border: 'none',
        padding: '4px 8px',
        cursor: openSettings ? 'pointer' : 'default',
        color: 'inherit',
        fontSize: 12,
      }}
    >
      <span
        aria-hidden
        style={{ width: 8, height: 8, borderRadius: '50%', background: stateColor(worst.state), flexShrink: 0 }}
      />
      {wide === true && <span>{rowSummary(worst, t, now)}</span>}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {tooltip}
      </span>
    </button>
  )
}
