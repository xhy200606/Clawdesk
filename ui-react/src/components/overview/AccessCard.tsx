import React, { useCallback } from "react";
import { t, i18n, SUPPORTED_LOCALES, type Locale } from "../../i18n/index.ts";
import { buildExternalLinkRel, EXTERNAL_LINK_TARGET } from "../../lib/util/external-link.ts";
import type { UiSettings } from "../../lib/util/storage.ts";
import { GatewayFields } from "./GatewayCard.tsx";

// ─── Drag Handle SVG ─────────────────────────────────────────

function DragHandle() {
  return (
    <button
      className="swapy-handle"
      data-swapy-handle
      title={t("overview.drag.hint") ?? "拖拽交换位置"}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="5" r="1" />
        <circle cx="9" cy="12" r="1" />
        <circle cx="9" cy="19" r="1" />
        <circle cx="15" cy="5" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="15" cy="19" r="1" />
      </svg>
    </button>
  );
}

export { DragHandle };

// ─── Main Component ──────────────────────────────────────────

export type AccessCardProps = {
  settings: UiSettings;
  password: string;
  isTrustedProxy: boolean;
  /** [merge] 网关连接状态（与网关连接卡片合并后展示） */
  connected?: boolean;
  helloVersion?: string | null;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
  onReconnect?: () => void;
};

export function AccessCard(props: AccessCardProps) {
  const {
    settings,
    password,
    isTrustedProxy,
    connected,
    helloVersion,
    onSettingsChange,
    onPasswordChange,
    onSessionKeyChange,
    onConnect,
    onRefresh,
    onReconnect,
  } = props;
  const currentLocale = i18n.getLocale();

  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSettingsChange({ ...settings, gatewayUrl: e.target.value });
    },
    [settings, onSettingsChange],
  );

  const handleTokenChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSettingsChange({ ...settings, token: e.target.value });
    },
    [settings, onSettingsChange],
  );

  const handlePasswordChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onPasswordChange(e.target.value);
    },
    [onPasswordChange],
  );

  const handleSessionKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSessionKeyChange(e.target.value);
    },
    [onSessionKeyChange],
  );

  const handleLocaleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const v = e.target.value as Locale;
      void i18n.setLocale(v);
      onSettingsChange({ ...settings, locale: v });
    },
    [settings, onSettingsChange],
  );

  return (
    <div data-swapy-slot="access">
      <div data-swapy-item="access">
        <div className="card ov-card--access ov-card--merged">
          <div className="card-header-row">
            <DragHandle />
            <div>
              <div className="card-title">牧场大门 · 网关连接</div>
              <div className="card-sub">连接、鉴权与网关管理</div>
            </div>
            {connected !== undefined && (
              <span
                className="pill"
                style={{
                  marginLeft: "auto",
                  color: connected ? "var(--color-success, #1D9E75)" : "#A32D2D",
                }}
              >
                {connected ? "已连接" : "未连接"}
              </span>
            )}
          </div>
          <div className="access-grid access-grid--compact" style={{ marginTop: 10 }}>
            <label className="field">
              <span>WebSocket URL</span>
              <input type="text" defaultValue={settings.gatewayUrl} onBlur={handleUrlChange} />
            </label>
            <label className="field">
              <span>{t("overview.access.gatewayToken")}</span>
              <input type="text" defaultValue={settings.token} onBlur={handleTokenChange} />
            </label>
            <label className="field">
              <span>
                {t("overview.access.password")} ({t("overview.access.notStored")})
              </span>
              <input
                type="password"
                placeholder="system or shared password"
                defaultValue={password}
                onBlur={handlePasswordChange}
              />
            </label>
            <label className="field">
              <span>{t("overview.access.defaultSessionKey")}</span>
              <input
                type="text"
                defaultValue={settings.sessionKey ?? ""}
                onBlur={handleSessionKeyChange}
              />
            </label>
          </div>

          {/* [merge] 网关连接管理（原独立「网关连接」卡片） */}
          {onReconnect && (
            <GatewayFields
              settings={settings}
              connected={Boolean(connected)}
              helloVersion={helloVersion ?? null}
              onSettingsChange={onSettingsChange}
              onReconnect={onReconnect}
            />
          )}

          <div className="row" style={{ margin: "8px 0 0", gap: 8, alignItems: "center" }}>
            <label className="field" style={{ margin: 0, flex: "0 0 auto" }}>
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
            <button className="btn btn--sm" onClick={onConnect}>
              {t("common.connect")}
            </button>
            <button className="btn btn--sm" onClick={onRefresh}>
              {t("common.refresh")}
            </button>
            <span className="muted">
              {isTrustedProxy
                ? t("overview.access.trustedProxy")
                : t("overview.access.connectHint")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
