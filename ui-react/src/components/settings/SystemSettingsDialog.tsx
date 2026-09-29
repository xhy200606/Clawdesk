import React, { useState } from "react";
import { i18n, t, SUPPORTED_LOCALES, type Locale } from "../../i18n/index.ts";
import {
  ACCENT_PRESETS,
  FONT_PRESETS,
  applySystemPrefs,
  loadSystemPrefs,
  saveSystemPrefs,
  type SystemPrefs,
} from "../../lib/theme/system-prefs.ts";
import type { ThemeMode } from "../../lib/theme/theme.ts";
import { useAppStore } from "../../store/appStore.ts";

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: "system", label: "跟随系统" },
  { mode: "light", label: "浅色" },
  { mode: "dark", label: "深色" },
];

const PREVIEW_TEXT = "你好，OpenClaw！The quick brown fox jumps over the lazy dog. 0123456789";

/**
 * 系统设置（独立整页视图，路由 #/settings）：
 * 主题 / 强调色 / 字体 / 牧场大门（网关接入）。
 * 设置只影响当前浏览器（localStorage + CSS 变量），不写入网关配置。
 */
export function SystemSettingsPage() {
  const theme = useAppStore((s) => s.theme);
  const settings = useAppStore((s) => s.settings);
  const password = useAppStore((s) => s.password);
  const set = useAppStore((s) => s.set);
  const applySettings = useAppStore((s) => s.applySettings);
  const [prefs, setPrefs] = useState<SystemPrefs>(() => loadSystemPrefs());

  const currentLocale = i18n.getLocale();
  const handleLocaleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as Locale;
    void i18n.setLocale(v);
    applySettings({ ...settings, locale: v });
  };

  const update = (patch: Partial<SystemPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveSystemPrefs(next);
    applySystemPrefs(next);
  };

  const setTheme = (mode: ThemeMode) => {
    set({ theme: mode });
    applySettings({ ...settings, theme: mode });
  };

  const fontPicker = (field: "uiFont" | "chatFont", title: string, hint: string) => {
    // 仅内置字体预设可选；历史遗留的自定义值作为只读选项保留
    const customSaved =
      prefs[field] && !FONT_PRESETS.some((f) => f.value === prefs[field])
        ? [{ label: `当前自定义：${prefs[field]}`, value: prefs[field] }]
        : [];
    const options = [...customSaved, ...FONT_PRESETS];
    return (
      <div className="sys-settings__font-group">
        <div className="sys-settings__font-head">
          <strong>{title}</strong>
          <small>{hint}</small>
        </div>
        <select
          className="sys-settings__select"
          value={prefs[field]}
          onChange={(e) => update({ [field]: e.target.value } as Partial<SystemPrefs>)}
        >
          {options.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <div className="sys-settings__preview" style={{ fontFamily: prefs[field] || undefined }}>
          <span className="sys-settings__preview-tag">{title}预览</span>
          {PREVIEW_TEXT}
        </div>
      </div>
    );
  };

  return (
    <div className="sys-settings sys-settings--page" role="main" aria-label="系统设置">
      <header className="sys-settings__header">
        <div>
          <small>SYSTEM</small>
          <h2>系统设置</h2>
          <p>主题、颜色与字体的本机偏好，仅保存在当前浏览器。</p>
        </div>
      </header>

      {/* 主题 */}
      <section className="sys-settings__section">
        <h3>主题</h3>
        <div className="sys-settings__theme-row">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              className={`sys-settings__theme-btn${theme === opt.mode ? " is-active" : ""}`}
              onClick={() => setTheme(opt.mode)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* 界面颜色 */}
      <section className="sys-settings__section">
        <h3>界面颜色</h3>
        <div className="sys-settings__swatches">
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              className={`sys-settings__swatch${prefs.accent.toLowerCase() === color.toLowerCase() ? " is-active" : ""}`}
              style={{ background: color }}
              title={color}
              onClick={() => update({ accent: color })}
            />
          ))}
          <label className="sys-settings__custom-color" title="自定义强调色">
            <input
              type="color"
              value={prefs.accent || "#0A84FF"}
              onChange={(e) => update({ accent: e.target.value })}
            />
            <span>自定义</span>
          </label>
          {prefs.accent && (
            <button
              type="button"
              className="sys-settings__reset"
              onClick={() => update({ accent: "" })}
            >
              恢复默认
            </button>
          )}
        </div>
      </section>

      {/* 字体 */}
      <section className="sys-settings__section">
        <h3>字体</h3>
        {fontPicker("uiFont", "界面字体", "侧栏、设置、卡片等整个界面")}
        {fontPicker("chatFont", "聊天字体", "仅聊天消息正文，可单独换成等宽/衬线")}
      </section>

      {/* 牧场大门（网关接入字段，自主页迁入） */}
      <section className="sys-settings__section">
        <h3>牧场大门 · 网关接入</h3>
        <p className="sys-settings__hint">
          连接与鉴权参数仅保存在本浏览器；主页保留「网关连接」卡片用于连接管理与重连。
        </p>
        <div className="access-grid access-grid--compact">
          <label className="field">
            <span>WebSocket URL</span>
            <input
              type="text"
              defaultValue={settings.gatewayUrl}
              onBlur={(e) => applySettings({ ...settings, gatewayUrl: e.target.value })}
            />
          </label>
          <label className="field">
            <span>网关 Token</span>
            <input
              type="text"
              defaultValue={settings.token}
              onBlur={(e) => applySettings({ ...settings, token: e.target.value })}
            />
          </label>
          <label className="field">
            <span>访问密码（不保存到网关）</span>
            <input
              type="password"
              placeholder="system or shared password"
              defaultValue={password}
              onBlur={(e) => set({ password: e.target.value })}
            />
          </label>
          <label className="field">
            <span>默认会话 Key</span>
            <input
              type="text"
              defaultValue={settings.sessionKey ?? ""}
              onBlur={(e) => {
                set({ sessionKey: e.target.value });
                applySettings({
                  ...settings,
                  sessionKey: e.target.value,
                  lastActiveSessionKey: e.target.value,
                });
              }}
            />
          </label>
          <label className="field">
            <span>界面语言</span>
            <select value={currentLocale} onChange={handleLocaleChange}>
              {SUPPORTED_LOCALES.map((loc) => {
                const key = loc.replace(/-([a-zA-Z])/g, (_, c: string) => c.toUpperCase());
                return (
                  <option key={loc} value={loc}>
                    {t(`languages.${key}`)}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}

export default SystemSettingsPage;
