> [!IMPORTANT]
> **上游项目致谢 / Upstream Attribution**
>
> 本仓库基于 **[josephxie1/openclaw-UI--Chinese](https://github.com/josephxie1/openclaw-UI--Chinese)**（中文增强版）
> 改造，该项目又是 **[openclaw/openclaw](https://github.com/openclaw/openclaw)** 的 fork。
>
> **所有核心功能、网关与原始代码均归上游作者所有**，感谢 [@josephxie1](https://github.com/josephxie1)
> 的中文化与增强工作，以及 OpenClaw 上游开发团队。
> 本仓库仅做了部署形态调整（纯客户端化、多网关管理、反向代理接入），不声明任何原始代码的权利。

# OpenClaw WebUI

**独立于 OpenClaw 的 Web 控制台**：一个纯前端客户端，通过 WebSocket 接入 OpenClaw 网关，
不内置任何网关代码。网关与客户端是两个独立容器，可各自独立升级。

## 架构

```
浏览器
  │  http://<host>:18888          同源访问，无跨域问题
  ▼
┌─────────────────────────────┐
│  openclaw-webui-client      │  本仓库：nginx + React 静态产物（119MB）
│  nginx 反代 /ws ────────────┼──► 注入 x-forwarded-user 等可信代理头
└─────────────────────────────┘
  │  ws://openclaw-gateway:18789（docker 内网）
  ▼
┌─────────────────────────────┐
│  openclaw-gateway           │  官方镜像 ghcr.io/openclaw/openclaw
│  auth.mode = trusted-proxy  │  独立升级，与客户端版本解耦
└─────────────────────────────┘
```

**为什么需要反向代理？** OpenClaw 要求控制界面具备"设备身份"（浏览器需处于 HTTPS 或 localhost
安全上下文才能生成）。纯 HTTP 的局域网浏览器无法提供，直连网关端口会被拒绝
（`CONTROL_UI_DEVICE_IDENTITY_REQUIRED`）。官方为此提供了 `trusted-proxy` 鉴权模式：
由反向代理完成身份注入后转发。本仓库的 nginx 即承担该角色。

## 快速部署

```bash
# 1) 创建共享网络（两个容器需互通，且网关要按 IP 信任代理）
docker network create openclaw_default --driver bridge --subnet 172.22.0.0/16

# 2) 启动网关
cd Openclaw-Gateway && docker compose up -d

# 3) 启动客户端
cd Openclaw-WebUI && ./build.sh && docker compose up -d
```

访问 **http://&lt;host&gt;:18888**，默认已填好网关地址，直接连接即可。

## 端口

| 服务                    | 端口      | 说明                                    |
| ----------------------- | --------- | --------------------------------------- |
| `openclaw-webui-client` | **18888** | WebUI（推荐入口）                       |
| `openclaw-gateway`      | 18789     | 网关 WS（供反代使用，一般无需直接访问） |

## 关键配置

网关 `config/openclaw.json`：

```jsonc
{
  "gateway": {
    "bind": "lan",
    "trustedProxies": ["172.22.0.11"], // WebUI 容器固定 IP
    "auth": {
      "mode": "trusted-proxy", // 与 gateway.auth.token 互斥
      "trustedProxy": {
        "userHeader": "x-forwarded-user",
        "requiredHeaders": ["x-forwarded-proto", "x-forwarded-host"],
        "deviceAutoApprove": { "enabled": true, "scopes": ["operator.admin"] },
      },
      "identityScopes": { "operator@openclaw-webui": ["operator.admin"] },
    },
    "controlUi": {
      "allowedOrigins": ["http://<host>:18888"],
    },
  },
}
```

客户端容器环境变量：`GATEWAY_UPSTREAM`（网关地址）、`PROXY_USER`（注入的身份）。

> 更换访问地址或端口时，必须同步 `controlUi.allowedOrigins`，否则浏览器跨域被拒。

## 多网关

概览页「网关连接」卡片可保存、切换、编辑、删除多个网关配置，并显示连接状态与网关版本。
换端口或换主机后同步网关白名单即可接入不同版本网关。

## 安全提示

`trusted-proxy` 模式下，凡是能访问 18888 端口的人即获得 operator 权限（认证由代理完成）。
建议：仅在内网/受防火墙保护的环境暴露；或启用基础认证：

```yaml
environment:
  WEBUI_BASIC_AUTH: "admin:<apr1 hash>"
  WEBUI_AUTH_DIRECTIVES: 'auth_basic "Openclaw WebUI"; auth_basic_user_file /etc/nginx/.htpasswd;'
```

## 开发

```bash
cd ui-react && npm install && npm run dev      # 前端开发服务器
npm run build                                   # 构建静态产物（约 7 秒）
npm run typecheck                               # 类型检查
```

- `ui-react/src/` —— React 控制台
- `ui-react/client-core/` —— 从上游抽取的纯工具/类型模块（断开对网关源码的编译期依赖）
- `ui-react/client-core/config/upstream-compat/` —— 上游配置适配层

## 版本适配

连接握手使用协议区间协商（`minProtocol: 3` ~ `maxProtocol: 99`）而非硬编码，
可同时兼容 protocol 3（v2026.3.x）与 protocol 4（v2026.9.x）的网关。
界面由网关下发的 `config.schema` 驱动，自动跟随所连网关的配置结构。
