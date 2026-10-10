/**
 * Client entry for the quota UI: registers the locale dictionary and fills
 * the settings-section and sidebar-footer slots.
 *
 * Data transport: the store prefers the typed `remote.quota` namespace when
 * it is reachable; cordis guards that property behind an inject declaration,
 * which this fiber cannot make (the namespace is mounted by this very fiber,
 * so requiring it would deadlock). The accessor therefore probes safely and
 * the store falls back to the Gateway's plain HTTP wire format — the same
 * endpoint the typed namespace fronts.
 *
 * @module dsh-client-ui-quota/client
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import React from 'react'
import { TYPERT_REMOTE } from 'dsh-quota-monitor/remote'
import { createQuotaStore, type QuotaRemote } from './store.js'
import { createActiveProviderTracker, type ActiveProviderTracker } from './active-provider.js'
import { QuotaSection } from './QuotaSection.js'
import { QuotaFooter } from './QuotaFooter.js'
import { NS, zh, en } from './locales.js'

export const inject = ['locale', 'remote', 'slots', 'sessions', 'modelDirectories']

interface SlotRuntime {
  register(
    meta: Record<string, unknown>,
    component: (props: Record<string, unknown>) => React.JSX.Element | null,
  ): () => void
  inject(name: string, register: () => () => void): void
}

interface LocaleService {
  register(ns: string, dicts: { zh: Record<string, unknown>; en: Record<string, unknown> }): void
  bind(ns: string): (key: string) => string
}

interface RemoteService {
  $mount(contribution: unknown): Promise<() => void>
}

export function apply(ctx: ClientContext): void {
  const locale = (ctx as unknown as { locale: LocaleService }).locale
  const remote = (ctx as unknown as { remote: RemoteService }).remote
  const slots = (ctx as unknown as { slots: SlotRuntime }).slots

  locale.register(NS, { zh, en })
  const t = locale.bind(NS) as (key: string) => string

  // Mount the namespace for spec compliance and any other consumer; the store
  // below does not depend on it thanks to the wire fallback.
  void remote.$mount(TYPERT_REMOTE).catch((error: unknown) => {
    console.error('dsh-client-ui-quota: quota Remote namespace mount failed; HTTP fallback stays active', error)
  })

  // Probe the namespace without an inject declaration: any guard throw simply
  // reads as "not mounted" and the store uses the wire format.
  const getNamespace = (): NonNullable<QuotaRemote['quota']> | undefined => {
    try {
      return (ctx as unknown as { get(key: string): QuotaRemote['quota'] }).get('remote.quota')
    } catch {
      return undefined
    }
  }

  const store = createQuotaStore(getNamespace)
  const stopPolling = store.start()

  // Follow the model the main-view session currently uses; rows declaring a
  // matching `llmProviders` entry surface first in the footer and carry an
  // "in use" badge on the page.
  const activeProvider: ActiveProviderTracker = createActiveProviderTracker(
    ctx as unknown as Parameters<typeof createActiveProviderTracker>[0],
  )

  const Section = (): React.JSX.Element => React.createElement(QuotaSection, { store, t, activeProvider })
  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'quota', order: 30, label: () => t('nav'), locale: NS },
      Section,
    ),
  )

  const Footer = (props: Record<string, unknown>): React.JSX.Element | null =>
    React.createElement(QuotaFooter, {
      store,
      t,
      activeProvider,
      wide: props['wide'] as boolean | undefined,
      openSettings: props['openSettings'] as (() => void) | undefined,
    })
  slots.inject('sidebar.footer.action', () =>
    slots.register({ name: 'sidebar.footer.action', id: 'quota', order: 20, locale: NS }, Footer),
  )

  ;(ctx as unknown as { on(event: string, listener: () => void): void }).on('dispose', () => {
    stopPolling()
    activeProvider.dispose()
  })
}
