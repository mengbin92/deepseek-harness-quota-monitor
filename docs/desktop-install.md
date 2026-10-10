# Desktop（Electron）端手动安装

`dsh plugin --profile desktop add` 会被拒绝：

```
error: profile "desktop" is managed exclusively by the Electron application
```

这个限制只在 CLI 的 `plugin` 子命令上，profile 本身仍是普通文件。桌面应用启动时照常组合 `dsh.profile.bundles` + `cordis.patch.yml`，所以可以手动安装：

## 步骤

以下假设仓库克隆在 `~/Desktop/deepseek-harness-quota-monitor`，并已完成 `npm run build`（见 README）。

### 1. 备份

```bash
cp ~/.dsh/profiles/desktop/package.json ~/.dsh/profiles/desktop/package.json.bak-quota
cp ~/.dsh/profiles/desktop/cordis.patch.yml ~/.dsh/profiles/desktop/cordis.patch.yml.bak-quota
```

### 2. 让包可被解析

把两个包软链进 profile 共享池（desktop profile 自己没有 node_modules，Node 解析会向上找到这里）：

```bash
ln -sfn ~/Desktop/deepseek-harness-quota-monitor/packages/quota-monitor ~/.dsh/profiles/node_modules/dsh-quota-monitor
ln -sfn ~/Desktop/deepseek-harness-quota-monitor/packages/client/ui-quota ~/.dsh/profiles/node_modules/dsh-client-ui-quota
```

### 3. 注册 bundle

编辑 `~/.dsh/profiles/desktop/package.json`，在 `dsh.profile.bundles` 末尾加入两个包名，并在 `dependencies` 里登记 link（与 CLI 安装产生的结构一致）：

```json
{
  "dependencies": {
    "dsh-client-ui-quota": "link:<仓库绝对路径>/packages/client/ui-quota",
    "dsh-quota-monitor": "link:<仓库绝对路径>/packages/quota-monitor"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-quota-monitor",
        "dsh-client-ui-quota"
      ]
    }
  }
}
```

### 4. 配置 providers

把 README「配置」一节的 `quota-monitor` YAML 追加到 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾。

### 5. 重启

`Cmd+Q` 完全退出桌面应用后重新打开，设置 → 额度 即可看到页面。

## 验证组合是否成功

可以用 dsh 自带的 profile-boot 库离线验证（无需启动应用）：

```bash
node --input-type=module -e "
import { loadProfile } from '@deepseek-ai/dsh-app-boot'
const p = loadProfile('dsh', 'desktop', process.env.HOME + '/.dsh/profiles/desktop')
console.log(p.layers.map(l => l.name ?? l.packageName))
console.log('skipped:', p.skippedBundles)
" 
# 期望 layers 里出现 dsh-quota-monitor / dsh-client-ui-quota，skipped 为空
```

（`@deepseek-ai/dsh-app-boot` 在 `npm root -g`/@deepseek-ai/dsh/node_modules 下。）

## 卸载 / 回滚

```bash
mv ~/.dsh/profiles/desktop/package.json.bak-quota ~/.dsh/profiles/desktop/package.json
mv ~/.dsh/profiles/desktop/cordis.patch.yml.bak-quota ~/.dsh/profiles/desktop/cordis.patch.yml
rm ~/.dsh/profiles/node_modules/dsh-quota-monitor ~/.dsh/profiles/node_modules/dsh-client-ui-quota
```
