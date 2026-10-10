/**
 * Locale dictionaries for the quota UI: every user-visible string lives
 * here, registered under the `quota` namespace.
 *
 * @module dsh-client-ui-quota/locales
 */

export const NS = 'quota'

export const zh = {
  nav: '额度',
  title: '供应商额度',
  refresh: '刷新',
  refreshing: '刷新中…',
  refreshedAt: '更新于',
  never: '尚未查询',
  balance: '余额',
  granted: '赠送',
  toppedUp: '充值',
  used: '已用',
  left: '剩余',
  usedUp: '已用完',
  inUse: '使用中',
  resetsIn: '后重置',
  stateOk: '正常',
  stateWarn: '偏低',
  stateError: '查询失败',
  stateUnsupported: '无配额接口',
  statePending: '查询中…',
  stateDisabled: '已停用',
  stale: '（缓存）',
  errorLabel: '错误',
  empty: '尚未配置供应商。在 cordis.patch.yml 的 dsh-quota-monitor 配置里添加 providers。',
  footerTooltipTitle: '供应商额度',
  windowUnit: {
    tokens: 'tokens',
    time: '次',
    requests: '次',
    credits: '积分',
  },
}

export const en = {
  nav: 'Quota',
  title: 'Provider quota',
  refresh: 'Refresh',
  refreshing: 'Refreshing…',
  refreshedAt: 'Updated',
  never: 'Never queried',
  balance: 'Balance',
  granted: 'Granted',
  toppedUp: 'Topped up',
  used: 'Used',
  left: 'Left',
  usedUp: 'Used up',
  inUse: 'in use',
  resetsIn: 'until reset',
  stateOk: 'OK',
  stateWarn: 'Low',
  stateError: 'Fetch failed',
  stateUnsupported: 'No quota endpoint',
  statePending: 'Pending…',
  stateDisabled: 'Disabled',
  stale: ' (cached)',
  errorLabel: 'Error',
  empty: 'No providers configured. Add providers to the dsh-quota-monitor entry in cordis.patch.yml.',
  footerTooltipTitle: 'Provider quota',
  windowUnit: {
    tokens: 'tokens',
    time: 'calls',
    requests: 'calls',
    credits: 'credits',
  },
}
