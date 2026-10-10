# deepseek-harness-quota-monitor

**[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的大模型供应商额度监控插件**——在 DSH 设置页和侧栏实时展示各家 LLM 供应商的余额与订阅套餐限额，再也不用切到浏览器查"还剩多少额度"。

English: A DeepSeek Harness plugin that monitors LLM provider balances and subscription rate-limit windows (5h/7d/daily/weekly/monthly), rendered as a Settings page and a sidebar indicator in the DSH web/desktop client.

## 效果

- **设置 → 额度**：每个供应商一张卡片 —— 余额明细（总额/赠送/充值）、订阅窗口进度条（<50% 绿 / 50–79% 黄 / ≥80% 红）、重置倒计时、上次刷新时间、单卡/全局刷新按钮
- **侧栏底部**：一个状态点，取所有供应商中最差的状态（绿/黄/红），悬停显示每家一行摘要，点击直达额度页

## 支持的供应商与额度类型

| fetcher | 供应商 | 数据 | 接口 |
|---|---|---|---|
| `deepseek-balance` | DeepSeek 官方 | 余额（总额/赠送/充值） | `GET /user/balance` |
| `zai-quota` | 智谱 GLM / Z.ai Coding Plan | **5 小时滚动窗口、7 天窗口、月度工具额度** | `GET /api/monitor/usage/quota/limit` |
| `neo-gateway` | micro-one-api 网关 | **钱包余额** + **订阅套餐日/周/月窗口** | `GET /v1/usage`、`GET /v1/subscription/usage` |
| `generic-http` | MiniMax / 任意 JSON 接口 | 自定义 path + 点分路径字段映射 | 用户配置 |
| `none` | 无查询接口的端点 | 占位展示"无配额接口" | — |

额度模型分两类，在同一行卡片上并存：

- **预付费余额**（`balances[]`）：货币、剩余总额、赠送/充值细分、累计消耗
- **订阅窗口限额**（`limits[]`）：用量、上限、百分比、重置时间戳 —— 智谱/Kimi 式"5 小时 + 7 天"窗口、neo 网关式"日/周/月"窗口都归一到这个模型

第三方插件还可以通过 `ctx.quotaMonitor.registerFetcher()` 注册新的抓取适配器。

## 架构

两个包，分别运行在 DSH 的 Host（Node）端和 Web Client 端：

```
packages/
├── quota-monitor/          # Host 服务包（dsh-quota-monitor）
│   ├── src/index.ts        #   QuotaMonitor 服务：定时刷新、快照聚合、Typert Remote
│   ├── src/types.ts        #   QuotaSnapshot / BalanceInfo / LimitInfo / BalanceFetcher
│   ├── src/fetchers/       #   4 个内置抓取适配器 + 共享 HTTP 工具
│   ├── src/remote-client.ts#   Typert Remote 描述符（host/client 共用）
│   └── test/smoke.mjs      #   适配器解析冒烟测试
└── client/ui-quota/        # Web 客户端包（dsh-client-ui-quota）
    └── src/
        ├── client.ts       #   apply(ctx)：槽位注册 + Remote 挂载 + HTTP 回退
        ├── QuotaSection.tsx#   设置页
        ├── QuotaFooter.tsx #   侧栏指示器
        ├── store.ts        #   快照轮询（Remote 优先，wire 格式兜底）
        └── locales.ts      #   中/英文案
```

数据流：

```
供应商 API ──抓取──> Host ctx.quotaMonitor（定时器 + 手动刷新）
                          │  Typert Remote 命名空间 "quota"
                          │  （失败时客户端回退 Gateway HTTP wire 格式）
                          ▼
                 Web 设置页 / 侧栏指示器（60s 轮询快照）
```

- **密钥安全**：API key 通过 `dsh-credentials` 按环境变量名解析，永不落盘、永不过线（Remote 只传额度数字）
- **失败语义**：抓取失败保留上一次成功值并标 `stale`；行内显示错误诊断
- **流量控制**：只有 Host 定时器和手动刷新会产生供应商请求，客户端轮询只读已聚合快照

详细设计见 [docs/quota-monitor-design.md](docs/quota-monitor-design.md)。

## 安装

前置：已安装 [dsh CLI](https://github.com/deepseek-ai/deepseek-harness)（`npm i -g @deepseek-ai/dsh`）。

```bash
git clone https://github.com/mengbin92/deepseek-harness-quota-monitor.git
cd deepseek-harness-quota-monitor

# 构建两个包
cd packages/quota-monitor && npm install && npm run build
cd ../client/ui-quota && npm install && npm run build

# 装入 web profile
dsh plugin --profile web add "$(pwd)/../../quota-monitor"
dsh plugin --profile web add "$(pwd)"
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 追加配置（见下节），重启 `dsh web`。

> **Desktop 端**：desktop profile 由 Electron 应用独占管理，`dsh plugin` CLI 拒绝写入。手动安装方式见 [docs/desktop-install.md](docs/desktop-install.md)。

## 配置

在 profile 的 `cordis.patch.yml` 中给 `quota-monitor` 行配置 `providers`：

```yaml
- id: quota-monitor
  name: "dsh-quota-monitor"
  config:
    refreshIntervalMinutes: 30   # 后台自动抓取间隔
    timeoutMs: 10000             # 单供应商抓取超时
    providers:
      # DeepSeek 官方余额
      - id: deepseek
        label: DeepSeek 官方
        fetcher: deepseek-balance
        baseURL: https://api.deepseek.com
        apiKeyEnv: DEEPSEEK_API_KEY     # 环境变量名，不是 key 本身
        warnThreshold: 5                # 余额 ≤ 5 元告警

      # 智谱 GLM Coding Plan（5h / 7天 / 月度工具窗口）
      - id: zai-coding
        label: 智谱 Coding Plan
        fetcher: zai-quota
        baseURL: https://open.bigmodel.cn
        apiKeyEnv: ZAI_API_KEY
        type: 2                         # 团队套餐=2，个人=1
        organization: org-xxxx          # 团队套餐必需，获取方法见下
        project: proj_xxxx
        warnThreshold: 80               # 窗口用量 ≥ 80% 告警

      # micro-one-api 网关：钱包余额 + 订阅日/周/月窗口
      - id: neo-gateway
        label: Neo 网关
        fetcher: neo-gateway
        baseURL: https://api.mengbin.top
        apiKeyEnv: NEO_API_KEY          # 与 /v1/chat/completions 同一把 relay key
        # wallet: false                # 可只抓订阅窗口
        # subscription: false          # 可只抓钱包余额
        warnThreshold: 80

      # 任意 JSON 接口（MiniMax / 自建网关等）
      - id: some-gateway
        label: 某网关
        fetcher: generic-http
        baseURL: http://gateway.local:3000
        path: /v1/quota
        apiKeyEnv: SOME_API_KEY
        headers: {}                     # 额外请求头（可选）
        mapping:
          balancePath: data.balance     # 剩余余额（点分路径）
          usedPath: data.used           # 已用（可选）
          grantedPath: data.granted     # 赠送（可选）
          currency: USD                 # 货币标签（或用 currencyPath 从响应读）
        warnThreshold: 2

      # 无查询接口的端点
      - id: stepfun
        label: 阶跃星辰
        fetcher: none
```

`warnThreshold` 语义：对余额表示"剩余 ≤ 阈值 → 告警"，对窗口限额表示"用量 ≥ 阈值% → 告警"。

### 智谱 organization / project / type 的获取

浏览器访问 <https://bigmodel.cn/coding-plan/> 并登录，DevTools → Network 里找到 `api/monitor/usage/quota/limit` 请求：

- 请求头 `bigmodel-organization` → `organization`
- 请求头 `bigmodel-project` → `project`
- URL query 的 `type` → `type`（团队=2，个人=1）

缺 `type` 会返回"当前用户不存在coding plan"；缺 org/project 头会返回空 `data:{}`。个人套餐通常不需要 org/project 头。

## 开发与测试

```bash
# Host 包：类型检查 + 构建
cd packages/quota-monitor && npm run build

# 适配器冒烟测试（mock fetch，无需真实 key）
node test/smoke.mjs          # 期望末尾输出 NEO SMOKE OK

# Client 包：构建（tsc 类型 + esbuild 打包成 ModuleLoader 格式）
cd ../client/ui-quota && npm run build

# 客户端模拟测试（Node 里模拟 DSH 模块系统执行 bundle）
node test/simulate.mjs       # CLIENT BUNDLE OK
node test/nested-mount.mjs   # NESTED MOUNT OK
node test/store-paths.mjs    # FALLBACK OK / TYPED PATH OK
```

改动后重启 `dsh web`（或桌面应用）生效；DSH 的 client-hmr 在 `pnpm run dev:web` 运行时支持热重载。

## 技术要点（给二次开发者）

- **cordis 插件体系**：Host 服务继承 `TypertRemoteService`，`@Remote` 方法暴露为 RPC；`static Config` 用 schemastery 声明，配置走 profile 的 cordis.patch.yml
- **Remote 描述符手写**：官方包由内部 `dsh-typert-generator` 构建期生成 `TYPERT` manifest，本仓库按同形状手写（`remote-client.ts`），服务构造时 `super(ctx, 'quotaMonitor', { namespace: 'quota' })` 的 namespace 必须与描述符一致
- **inject 守卫**：浏览器里 `ctx.remote.quota` 受 cordis inject 声明保护；本插件用 `ctx.get()` 探测 + try/catch 回退，避免"命名空间由自己挂载"的死锁
- **客户端 bundle 格式**：必须是 `window.__ModuleLoader__.load({id, factory})` 的 CJS 打包产物（esbuild.mjs），react 等平台模块保持 external `require()`，由客户端模块表提供

## 路线图

- [ ] Anthropic 系响应头被动采集（`anthropic-ratelimit-unified-5h/7d-*`，包装 `llm/stream` waterfall，零额外请求）
- [ ] 额度耗尽主动告警（监听 `dsh-llm` 的 `QUOTA`/`ACCOUNT_QUOTA` 失败码）
- [ ] 用量历史持久化与趋势图（`dsh-storage-json`）
- [ ] new-api 系网关的 access-token 余额查询适配器

## License

[MIT](LICENSE)
