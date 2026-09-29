/**
 * 系统偏好（客户端本地）：界面字体 / 聊天字体 / 强调色。
 *
 * 持久化在 localStorage，应用方式是往 :root 写 CSS 变量：
 *  - --font-ui   → body 基础字体（base.css body 使用）
 *  - --font-chat → 聊天正文字体（chat/text.css .chat-text 使用）
 *  - --accent / --primary / --ring / --accent-hover / --accent-subtle / --accent-glow
 *
 * 网络字体（JetBrains Mono / IBM Plex Sans / Inter / Noto Sans SC）按需注入
 * Google Fonts <link>，本地已装则直接用本地字形。
 */

export type SystemPrefs = {
  /** 界面字体 CSS font-family 栈，空字符串 = 跟随默认 */
  uiFont: string;
  /** 聊天正文字体栈，空字符串 = 跟随界面字体 */
  chatFont: string;
  /** 强调色 #RRGGBB，空字符串 = 跟随主题默认 */
  accent: string;
};

const KEY = "openclaw.systemPrefs.v1";

export const FONT_PRESETS: Array<{ label: string; value: string; webfont?: string }> = [
  { label: "系统默认", value: "" },
  {
    label: "Inter",
    value: "Inter, -apple-system, PingFang SC, sans-serif",
    webfont: "Inter:wght@400;500;600",
  },
  {
    label: "IBM Plex Sans",
    value: "IBM Plex Sans, -apple-system, PingFang SC, sans-serif",
    webfont: "IBM+Plex+Sans:wght@400;500;600",
  },
  {
    label: "JetBrains Mono",
    value: "JetBrains Mono, Menlo, Consolas, monospace",
    webfont: "JetBrains+Mono:wght@400;500",
  },
  {
    label: "IBM Plex Mono",
    value: "IBM Plex Mono, Menlo, Consolas, monospace",
    webfont: "IBM+Plex+Mono:wght@400;500",
  },
  {
    label: "思源黑体 Noto Sans SC",
    value: "Noto Sans SC, PingFang SC, Microsoft YaHei, sans-serif",
    webfont: "Noto+Sans+SC:wght@400;500",
  },
  { label: "苹方 / 雅黑", value: "PingFang SC, Microsoft YaHei, sans-serif" },
  { label: "宋体 / 衬线", value: "Georgia, Songti SC, SimSun, serif" },
  { label: "等宽（系统）", value: "Menlo, Monaco, Courier New, monospace" },
];

export const ACCENT_PRESETS: string[] = [
  "#0A84FF", // iOS 蓝（默认）
  "#30D158", // 绿
  "#BF5AF2", // 紫
  "#FF9F0A", // 橙
  "#FF375F", // 粉
  "#64D2FF", // 青
  "#FFD60A", // 黄
];

const WEBFONT_FAMILY_HINTS: Array<[RegExp, string]> = [
  [/JetBrains[ +]Mono/i, "JetBrains+Mono:wght@400;500;700"],
  [/IBM[ +]Plex[ +]Sans/i, "IBM+Plex+Sans:wght@400;500;600"],
  [/IBM[ +]Plex[ +]Mono/i, "IBM+Plex+Mono:wght@400;500"],
  [/(?<!Noto )Inter/i, "Inter:wght@400;500;600"],
  [/Noto[ +]Sans[ +]SC/i, "Noto+Sans+SC:wght@400;500;700"],
];

const injectedWebfonts = new Set<string>();

/** 选中含网络字体的栈时按需注入 Google Fonts（失败静默，浏览器回退本地字形） */
function ensureWebfont(fontStack: string) {
  if (!fontStack) return;
  for (const [pattern, query] of WEBFONT_FAMILY_HINTS) {
    if (!pattern.test(fontStack) || injectedWebfonts.has(query)) continue;
    injectedWebfonts.add(query);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
    link.onerror = () => link.remove();
    document.head.appendChild(link);
  }
}

export function loadSystemPrefs(): SystemPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SystemPrefs>;
      return {
        uiFont: typeof parsed.uiFont === "string" ? parsed.uiFont : "",
        chatFont: typeof parsed.chatFont === "string" ? parsed.chatFont : "",
        accent: typeof parsed.accent === "string" ? parsed.accent : "",
      };
    }
  } catch {
    // 损坏的持久化数据按默认处理
  }
  return { uiFont: "", chatFont: "", accent: "" };
}

export function saveSystemPrefs(prefs: SystemPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 隐私模式等场景写入失败不致命
  }
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 与白色按比例混合（ratio = 白色占比） */
function lighten(hex: string, ratio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mixed = rgb.map((c) => Math.round(c + (255 - c) * ratio));
  return `#${mixed.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** 相对亮度决定前景用白还是黑 */
function foregroundFor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#1a1a1a" : "#ffffff";
}

/** 把偏好写到 :root CSS 变量；空值 = 移除覆盖、回到主题默认 */
export function applySystemPrefs(prefs: SystemPrefs) {
  const root = document.documentElement;
  if (prefs.uiFont.trim()) {
    ensureWebfont(prefs.uiFont);
    root.style.setProperty("--font-ui", prefs.uiFont.trim());
  } else {
    root.style.removeProperty("--font-ui");
  }
  if (prefs.chatFont.trim()) {
    ensureWebfont(prefs.chatFont);
    root.style.setProperty("--font-chat", prefs.chatFont.trim());
  } else {
    root.style.removeProperty("--font-chat");
  }
  const accent = prefs.accent.trim();
  const rgb = accent ? hexToRgb(accent) : null;
  if (accent && rgb) {
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--primary", accent);
    root.style.setProperty("--ring", accent);
    root.style.setProperty("--accent-muted", accent);
    root.style.setProperty("--accent-hover", lighten(accent, 0.18));
    root.style.setProperty("--accent-subtle", `rgba(${rgb.join(", ")}, 0.15)`);
    root.style.setProperty("--accent-glow", `rgba(${rgb.join(", ")}, 0.25)`);
    root.style.setProperty("--accent-foreground", foregroundFor(accent));
    root.style.setProperty("--primary-foreground", foregroundFor(accent));
  } else {
    for (const name of [
      "--accent",
      "--primary",
      "--ring",
      "--accent-muted",
      "--accent-hover",
      "--accent-subtle",
      "--accent-glow",
      "--accent-foreground",
      "--primary-foreground",
    ]) {
      root.style.removeProperty(name);
    }
  }
}

/** 启动时调用：恢复上次的系统偏好 */
export function restoreSystemPrefs() {
  applySystemPrefs(loadSystemPrefs());
}
