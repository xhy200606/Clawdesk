# upstream-compat 适配层

fork 配置 schema 与上游 OpenClaw 新版本之间的**唯一适配点**。

- 来源：`upstream-v2026.9.6`（fork 基线 2026.3.27 / v2026.3.28）
- 新增顶层配置节：telemetry, desktop, proxy, security, accessGroups, cloudWorkers
- 接入点唯一：`src/config/zod-schema.ts` 把 `upstreamCompatSections`
  展开进 OpenClawSchema 顶层 shape，其余 fork 源码零修改。
- 自包含：上游工具包依赖（@openclaw/normalization-core、net-policy、
  secrets/ref-contract 增量导出）由 `helpers.ts` 本地实现替代。
- fork 已有的顶层节（session/memory/gateway/hooks/channels 等）不在本层
  重复定义——那些节以 fork 自身 schema 为准，保证运行时类型一致。

## 升级流程（下次上游更新）

1. `git fetch <upstream> refs/tags/v<new>:refs/tags/upstream-v<new>`
2. 重跑装配脚本：`python3 scripts/assemble_compat_layer.py upstream-v<new> .`
3. `pnpm tsgo` 检查类型，漂移只改本目录；
4. `pnpm config:schema:gen` 重新生成 base schema，`./build.sh` 重建镜像。

## 已知边界

- 新节对 fork 是"可校验、可保存"的配置面（WebUI 设置页因此能展示/编辑）；
  fork 运行逻辑是否消费这些配置取决于 fork 自身实现。
- `cloudWorkers` 依赖 `hosted-git-info`（纯 JS 小库，来自上游同版本）。
