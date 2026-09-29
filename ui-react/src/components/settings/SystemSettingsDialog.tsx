import React, { useState } from "react";
import { createPortal } from "react-dom";
import {
  ACCENT_PRESETS,
  FONT_PRESETS,
  applySystemPrefs,
  loadSystemPrefs,
  saveSystemPrefs,
  type SystemPrefs,
} from "../../lib/system-prefs.ts";
import type { ThemeMode } from "../../lib/theme.ts";
import { useAppStore } from "../../store/appStore.ts";

const THEME_OPTIONS: Array<{ mode: ThemeMode; label: string }> = [
  { mode: "system", label: "跟随系统" },
  { mode: "light", label: "浅色" },
  { mode: "dark", label: "深色" },
];

const PREVIEW_TEXT = "你好，OpenClaw！The quick brown fox jumps over the lazy dog. 0123456789";

/**
 * 系统设置弹窗：关于软件本机外观的设置（主题 / 强调色 / 字体）。
 * 从左下角用户菜单「高级设置」下方入口打开。
 * 设置只影响当前浏览器（localStorage + CSS 变量），不写入网关配置。
 */
export function SystemSettingsDialog({ onClose }: { onClose: () => void }) {
  const theme = useAppStore((s) => s.theme);
  const settings = useAppStore((s) => s.settings);
  const set = useAppStore((s) => s.set);
  const applySettings = useAppStore((s) => s.applySettings);
  const [prefs, setPrefs] = useState<SystemPrefs>(() => loadSystemPrefs());

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

  const fontPicker = (field: "uiFont" | "chatFont", title: string, hint: string) => (
    <div className="sys-settings__font-group">
      <div className="sys-settings__font-head">
        <strong>{title}</strong>
        <small>{hint}</small>
      </div>
      <select
        className="sys-settings__select"
        value={FONT_PRESETS.some((f) => f.value === prefs[field]) ? prefs[field] : ""}
        onChange={(e) => {
          const custom = e.target.value === "__custom__";
          update({ [field]: custom ? prefs[field] : e.target.value } as Partial<SystemPrefs>);
        }}
      >
        {FONT_PRESETS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
        <option value="__custom__" disabled>
          自定义…
        </option>
      </select>
      <input
        className="sys-settings__custom-input"
        placeholder="或直接填写 CSS font-family，如 JetBrains Mono, monospace"
        value={prefs[field]}
        onChange={(e) => update({ [field]: e.target.value } as Partial<SystemPrefs>)}
      />
      <div className="sys-settings__preview" style={{ fontFamily: prefs[field] || undefined }}>
        <span className="sys-settings__preview-tag">{title}预览</span>
        {PREVIEW_TEXT}
      </div>
    </div>
  );

  return createPortal(
    <div className="sys-settings__overlay" onClick={onClose} role="presentation">
      <div
        className="sys-settings"
        role="dialog"
        aria-modal="true"
        aria-label="系统设置"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sys-settings__header">
          <div>
            <small>SYSTEM</small>
            <h2>系统设置</h2>
            <p>主题、颜色与字体的本机偏好，仅保存在当前浏览器。</p>
          </div>
          <button type="button" className="sys-settings__close" onClick={onClose} title="关闭">
            ✕
          </button>
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
      </div>
    </div>,
    document.body,
  );
}

export default SystemSettingsDialog;
