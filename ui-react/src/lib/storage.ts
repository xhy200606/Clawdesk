const KEY = "openclaw.control.settings.v1";

import { isSupportedLocale } from "../i18n/index.ts";
import { inferBasePathFromPathname, normalizeBasePath } from "./navigation.ts";
import type { ThemeMode } from "./theme.ts";

// [multi-gateway] 一个可切换的 OpenClaw 网关连接配置
export type GatewayProfile = {
  id: string;
  name: string;
  url: string;
  token: string;
};

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
  fileExplorerOpen: boolean; // 聊天页右侧 Workspace 文件管理器开关
  locale?: string;
  // [multi-gateway] 已保存的网关列表与当前激活项
  gateways?: GatewayProfile[];
  activeGatewayId?: string | null;
};

export function loadSettings(): UiSettings {
  const defaultUrl = (() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const configured =
      typeof window !== "undefined" &&
      typeof window.__OPENCLAW_CONTROL_UI_BASE_PATH__ === "string" &&
      window.__OPENCLAW_CONTROL_UI_BASE_PATH__.trim();
    const basePath = configured
      ? normalizeBasePath(configured)
      : inferBasePathFromPathname(location.pathname);
    // [client] 本客户端自带 nginx 反向代理：WebSocket 走同源 /ws 路径，
    // 由 nginx 注入网关可信代理身份头后转发。直接连网关端口会被设备身份校验拒绝。
    const wsPath = `${basePath.replace(/\/$/, "")}/ws`;
    return `${proto}://${location.host}${wsPath}`;
  })();

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
    fileExplorerOpen: false,
    gateways: [{ id: "default", name: "默认网关", url: defaultUrl, token: "" }],
    activeGatewayId: "default",
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl:
        typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
          ? parsed.gatewayUrl.trim()
          : defaults.gatewayUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
      fileExplorerOpen:
        typeof parsed.fileExplorerOpen === "boolean"
          ? parsed.fileExplorerOpen
          : defaults.fileExplorerOpen,
      locale: isSupportedLocale(parsed.locale) ? parsed.locale : undefined,
      gateways: Array.isArray(parsed.gateways)
        ? parsed.gateways
            .filter(
              (g): g is GatewayProfile =>
                !!g && typeof g.id === "string" && typeof g.url === "string",
            )
            .map((g) => ({
              id: g.id,
              name: typeof g.name === "string" && g.name.trim() ? g.name : g.id,
              url: g.url,
              token: typeof g.token === "string" ? g.token : "",
            }))
        : defaults.gateways,
      activeGatewayId:
        typeof parsed.activeGatewayId === "string" && parsed.activeGatewayId
          ? parsed.activeGatewayId
          : defaults.activeGatewayId,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
