// Host service logic: warn thresholds, error/stale rows, refresh dedupe,
// duplicate-id handling. Constructs QuotaMonitor directly (cordis Context
// without a profile; timer calls are stubbed).
import { Context } from '@deepseek-ai/cordis'
import QuotaMonitor from '../lib/index.js'

const makeMonitor = (providers, config = {}) => {
  const ctx = new Context()
  ctx.setInterval = () => {} // cordis-plugin-timer stands in for these in real profiles
  ctx.setTimeout = () => {}
  const monitor = new QuotaMonitor(ctx, { refreshIntervalMinutes: 30, timeoutMs: 1000, providers, ...config })
  return monitor
}

// --- duplicate ids collapse to one row ---
{
  const monitor = makeMonitor([
    { id: 'a', fetcher: 'none' },
    { id: 'a', fetcher: 'none', label: 'copy' },
    { id: 'b', fetcher: 'none' },
  ])
  const rows = monitor.snapshot().providers
  if (rows.length !== 2) throw new Error(`duplicate ids not deduped: ${rows.length} rows`)
  if (rows[0].id !== 'a' || rows[1].id !== 'b') throw new Error('dedupe changed order: ' + JSON.stringify(rows))
  console.log('dedupe OK')
}

// --- ordering: order asc, ties keep config order ---
{
  const monitor = makeMonitor([
    { id: 'c', order: 10, fetcher: 'none' },
    { id: 'a', order: -1, fetcher: 'none' },
    { id: 'b', fetcher: 'none' },
  ])
  const ids = monitor.snapshot().providers.map((row) => row.id)
  if (ids.join(',') !== 'a,b,c') throw new Error('order wrong: ' + ids)
  console.log('order OK')
}

// --- warn threshold: balance floor and limit percent ceiling ---
{
  // exercise warn rules through refresh with stub fetchers
  const ctx2 = new Context()
  ctx2.setInterval = () => {}
  ctx2.setTimeout = () => {}
  const m2 = new QuotaMonitor(ctx2, {
    refreshIntervalMinutes: 30,
    timeoutMs: 1000,
    providers: [
      { id: 'low', fetcher: 'fake', warnThreshold: 5 },
      { id: 'high', fetcher: 'fake', warnThreshold: 5 },
      { id: 'window', fetcher: 'fake-windows', warnThreshold: 80 },
    ],
  })
  m2.registerFetcher({
    kind: 'fake',
    fetch: async (request) => ({
      balances: [{ currency: 'CNY', total: request.options.id === 'low' ? 4 : 42 }],
    }),
  })
  m2.registerFetcher({
    kind: 'fake-windows',
    fetch: async () => ({ limits: [{ label: 'w', kind: 'tokens', used: 90, total: 100, percent: 90 }] }),
  })
  const snap = await m2.refresh()
  const byId = Object.fromEntries(snap.providers.map((row) => [row.id, row]))
  if (byId.low.state !== 'warn') throw new Error('low balance must warn: ' + byId.low.state)
  if (byId.high.state !== 'ok') throw new Error('high balance must be ok: ' + byId.high.state)
  if (byId.window.state !== 'warn') throw new Error('90% window must warn: ' + byId.window.state)
  console.log('warn OK')
}

// --- failure folds into an error row; a later failure keeps stale data ---
{
  const ctx = new Context()
  ctx.setInterval = () => {}
  ctx.setTimeout = () => {}
  const m = new QuotaMonitor(ctx, {
    refreshIntervalMinutes: 30,
    timeoutMs: 1000,
    providers: [{ id: 'flaky', fetcher: 'flaky' }],
  })
  let fail = false
  m.registerFetcher({
    kind: 'flaky',
    fetch: async () => {
      if (fail) throw new Error('boom')
      return { balances: [{ currency: 'USD', total: 10 }] }
    },
  })
  await m.refresh()
  let row = m.snapshot().providers[0]
  if (row.state !== 'ok' || row.balances[0].total !== 10) throw new Error('first fetch failed: ' + JSON.stringify(row))
  fail = true
  await m.refresh()
  row = m.snapshot().providers[0]
  if (row.state !== 'error' || row.error !== 'boom') throw new Error('error row wrong: ' + JSON.stringify(row))
  if (row.stale !== true || row.balances[0].total !== 10) throw new Error('stale data lost: ' + JSON.stringify(row))
  if (row.fetchedAt === undefined) throw new Error('stale row must keep fetchedAt')
  console.log('stale OK')
}

// --- concurrent refreshes share one fetch; a slow stale attempt cannot clobber ---
{
  const ctx = new Context()
  ctx.setInterval = () => {}
  ctx.setTimeout = () => {}
  const m = new QuotaMonitor(ctx, {
    refreshIntervalMinutes: 30,
    timeoutMs: 5000,
    providers: [{ id: 'p', fetcher: 'counting' }],
  })
  let calls = 0
  m.registerFetcher({
    kind: 'counting',
    fetch: async () => {
      calls += 1
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { balances: [{ currency: 'USD', total: 1 }] }
    },
  })
  await Promise.all([m.refresh(), m.refresh(), m.refresh('p')])
  if (calls !== 1) throw new Error(`concurrent refreshes multiplied fetches: ${calls}`)
  console.log('inflight dedupe OK')
}

// --- unknown fetcher kind and hidden/disabled rows ---
{
  const m = makeMonitor([
    { id: 'ghost', fetcher: 'missing-kind' },
    { id: 'off', fetcher: 'none', enabled: false },
    { id: 'secret', fetcher: 'none', hidden: true },
  ])
  const snap = await m.refresh()
  const byId = Object.fromEntries(snap.providers.map((row) => [row.id, row]))
  if (byId.secret !== undefined) throw new Error('hidden row leaked into snapshot')
  if (byId.off.state !== 'disabled') throw new Error('disabled row wrong: ' + byId.off.state)
  if (byId.ghost.state !== 'error' || !byId.ghost.error.includes('missing-kind')) {
    throw new Error('unknown kind must be an error row: ' + JSON.stringify(byId.ghost))
  }
  console.log('row states OK')
}

console.log('MONITOR OK')
process.exit(0)
