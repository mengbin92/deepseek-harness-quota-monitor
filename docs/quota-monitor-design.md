# DSH 额度监控插件 — 设计文档

监控大模型供应商额度使用情况的 DSH 插件，由两个包组成：

| 包 | 运行端 | 职责 |
|---|---|---|
| `dsh-quota-monitor` | Host (Node) | 周期抓取各供应商余额，聚合为 `QuotaSnapshot`，暴露 `ctx.quotaMonitor` 服务 + Typert Remote 命名空间 `quota` |
| `dsh-client-ui-quota` | Web Client | 注册 `settings.section`（设置页"额度"页）与 `sidebar.footer.action`（侧栏常驻指示器） |

## 数据来源

唯一数据来源是**供应商配额 API**，通过可插拔适配器（BalanceFetcher）抓取。套餐分两类，数据模型上并存：

- **预付费余额**（DeepSeek 官方等）→ `balances[]`（货币/总额/赠送/充值）
- **订阅套餐窗口限额**（智谱 GLM Coding Plan、Kimi、MiniMax 等的 5 小时/7 天滚动窗口、月度工具额度）→ `limits[]`（用量/上限/百分比/重置时间）

| fetcher kind | 适用 | 协议 |
|---|---|---|
| `deepseek-balance` | DeepSeek 官方 | `GET {baseURL}/user/balance`，`Authorization: Bearer <key>` → `balance_infos[]` |
| `zai-quota` | 智谱 GLM / Z.ai Coding Plan | `GET {baseURL}/api/monitor/usage/quota/limit` → `data.limits[]`（unit 3=5h 窗口, 6=7天, 5=月度工具）；支持 `organization`/`project`/`type` 配置项（团队套餐必需） |
| `generic-http` | MiniMax / 自建网关 / 其它 | 用户配置 `path`、`headers`、字段映射（`balancePath`/`usedPath`/`limitsPath` 等点分路径） |
| `none` | 无查询接口的端点 | 标记为不支持，UI 显示"该供应商无配额接口" |

API key 通过 `dsh-credentials` 的 `ctx.credentials.resolve(credentialRef(envName))` 解析，永不落盘、永不过线（Remote 只传配额数字）。

**未实现的增强方向**：Anthropic 系订阅的 `anthropic-ratelimit-unified-5h/7d-*` 响应头被动采集——可通过 `ctx.on('llm/stream')` waterfall 包装 `ctx.llm.stream` 实现（零额外请求，每次对话后自动更新），留作后续版本。

## Host 端：`ctx.quotaMonitor`

```ts
class QuotaMonitor extends Service {
  static Config  // schemastery
  constructor(ctx, config)
  snapshot(): QuotaSnapshot           // 最近一次抓取的完整快照（同步读内存）
  refresh(providerId?): Promise<QuotaSnapshot>  // 立即重抓（全部或单个）
  registerFetcher(fetcher: BalanceFetcher): () => void  // 第三方扩展点
}

interface QuotaSnapshot {
  fetchedAt: number                   // ms epoch
  providers: ProviderQuota[]
}
interface ProviderQuota {
  id: string                          // 配置里的 provider key
  label: string
  state: 'ok' | 'warn' | 'error' | 'unsupported' | 'pending' | 'disabled'
  balances: BalanceInfo[]             // 多币种/多账户时多条
  error?: string                      // state=error 时的诊断
  warnThreshold?: number
}
interface BalanceInfo {
  currency: string
  total?: number; granted?: number; toppedUp?: number; used?: number
}
```

**配置**（cordis.patch.yml）：

```yaml
- name: 'dsh-quota-monitor'
  config:
    refreshIntervalMinutes: 30
    timeoutMs: 10000
    providers:
      - id: deepseek
        label: DeepSeek 官方
        fetcher: deepseek-balance
        baseURL: https://api.deepseek.com
        apiKeyEnv: DEEPSEEK_API_KEY
        warnThreshold: 5          # 余额低于 5 元进入 warn
      - id: local-gateway
        label: 自建网关
        fetcher: generic-http
        baseURL: http://192.168.110.123:3000
        path: /v1/dashboard/billing/credit_grants   # 示例
        apiKeyEnv: LOCAL_API_KEY
        mapping:
          balancePath: total_available
          totalPath: total_granted
          usedPath: total_used
          currency: USD
        warnThreshold: 2
      - id: stepfun
        label: 阶跃星辰
        fetcher: none
```

**失败语义**：抓取失败 → `state: 'error'`，保留上一次成功值（带 `stale: true`）；定时器用 cordis 的 `ctx.setInterval`（卸载即清理）。

**Remote 暴露**：`@Remote` 方法 `snapshot()` / `refresh(providerId?)`，业务包遵循 `dsh-typert-protocol` 的 TypertRemoteService 模式。生成物（`typert.host` / `typert.remote-client`）官方包由 `dsh-typert-generator` 构建期生成；本插件手写等价的 zod descriptor（见 `src/typert.*`），客户端也可选择直接用 `fetch('/api/...')` 的 SRC 模式——当前实现**优先 Typert，回退轮询 settings**。

## Client 端：两个槽位

1. **`settings.section`**（id `quota`，order 30）：provider 卡片列表 —— 余额大数字、货币、granted/topped-up 细分、进度条（used/total）、warn 阈值编辑、立即刷新按钮、上次抓取时间与错误诊断。
2. **`sidebar.footer.action`**：一个紧凑指示器 —— 所有 provider 中最差的 state 决定颜色（ok 绿 / warn 黄 / error 红），tooltip 列出每个 provider 的余额一行，点击打开设置页额度区。

**更新机制**：挂载时 `ctx.remote.quota.snapshot()` 拿基线；之后每 60s 轮询 + 设置页打开时主动 `refresh()`。Host 侧定时器保证数据新鲜，客户端轮询只是拉取已算好的快照，成本极低。

**国际化**：`ctx.locale.register('quota', { zh, en })`，所有文案走 `ctx.locale.bind('quota')`。

## 目录结构

```
packages/
├── quota-monitor/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts        # Service 入口 + Config schema
│       ├── types.ts        # QuotaSnapshot / BalanceFetcher / Config 类型
│       ├── fetchers/
│       │   ├── deepseek.ts
│       │   └── generic-http.ts
│       └── typert.ts       # 手写 Remote descriptor
└── client/ui-quota/
    ├── package.json
    └── src/
        ├── client.ts       # apply(ctx) 入口，槽位注册
        ├── locales.ts      # zh/en 字典
        ├── QuotaSection.tsx    # 设置页
        ├── QuotaFooter.tsx     # 侧栏指示器
        └── store.ts        # 轮询 + 快照状态
```

## 安装

```bash
cd packages/quota-monitor && pnpm build
dsh plugin --profile web add <workspace>/packages/quota-monitor
dsh plugin --profile web add <workspace>/packages/client/ui-quota
# 然后在 cordis.patch.yml 里给 dsh-quota-monitor 加 config
```

## 显式排除

- **不做**本地 token 计量/价格估算（`dsh-token-meter` 已覆盖 session 内维度，且用户选择了纯余额 API 路线）
- **不做**配额耗尽主动告警通知（第一版 UI 只被动展示 state；`dsh-llm` 的 QUOTA 失败码事件留作后续增强）
- **不做**用量历史图表（快照只保留最新值 + 上一次成功值）
