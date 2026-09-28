import React, { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../../i18n/index.ts";
import { ACCENT_COLORS, ACCENT_IDS, ACCENT_LABELS } from "../../lib/storage.ts";
import { useAppStore } from "../../store/appStore.ts";

// ─── 主题色选择器（多主题色切换） ────────────────────────────

function AccentPicker() {
  const settings = useAppStore((s) => s.settings);
  const applySettings = useAppStore((s) => s.applySettings);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = settings.accent ?? "blue";

  return (
    <div className="accent-picker" ref={ref}>
      <button
        className="topbar-restart-btn"
        onClick={() => setOpen((v) => !v)}
        title="主题色"
        aria-label="切换主题色"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" fill={ACCENT_COLORS[current] ?? "#0A84FF"} />
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
        <span className="topbar-restart-btn__label">主题</span>
      </button>
      {open && (
        <div className="accent-picker__menu" role="menu">
          {ACCENT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              role="menuitemradio"
              aria-checked={current === id}
              className={`accent-picker__item${current === id ? " accent-picker__item--active" : ""}`}
              onClick={() => {
                applySettings({ ...settings, accent: id });
                setOpen(false);
              }}
            >
              <span
                className="accent-picker__swatch"
                style={{ background: ACCENT_COLORS[id] ?? "#0A84FF" }}
              />
              <span>{ACCENT_LABELS[id] ?? id}</span>
              {current === id && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginLeft: "auto" }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Topbar() {
  const connected = useAppStore((s) => s.connected);
  const hello = useAppStore((s) => s.hello);
  const settings = useAppStore((s) => s.settings);
  const applySettings = useAppStore((s) => s.applySettings);
  const client = useAppStore((s) => s.client);

  const [restarting, setRestarting] = useState(false);

  const handleRestart = useCallback(async () => {
    if (!client || !connected || restarting) {
      return;
    }
    setRestarting(true);
    try {
      // Paso 1: obtener hash de la config actual (slim, sin RangeError)
      const snapshot = await client.request<{ hash?: string }>("config.get", {});
      const baseHash = snapshot?.hash;
      if (!baseHash) {
        throw new Error("no hash");
      }
      // Paso 2: enviar merge-patch vacío para disparar restart sin cambiar config
      await client.request("config.patch", {
        raw: "{}",
        baseHash,
      });
    } catch {
      // Esperado: la conexión se cierra durante el restart
    } finally {
      setTimeout(() => setRestarting(false), 5000);
    }
  }, [client, connected, restarting]);

  const version =
    (typeof hello?.server?.version === "string" && hello.server.version.trim()) || t("common.na");
  const versionStatusClass = "ok";

  return (
    <header className="topbar">
      {/* Mostrar botón de expandir solo cuando la nav está colapsada */}
      {settings.navCollapsed && (
        <button
          className="nav-collapse-toggle"
          onClick={() => applySettings({ ...settings, navCollapsed: false })}
          title={t("nav.expand")}
          aria-label={t("nav.expand")}
        >
          <span className="nav-collapse-toggle__icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </span>
        </button>
      )}
      <div style={{ flex: 1 }} />
      <div className="topbar-status">
        <AccentPicker />
        <button
          className={`topbar-restart-btn${settings.fileExplorerOpen ? " topbar-restart-btn--active" : ""}`}
          onClick={() =>
            applySettings({ ...settings, fileExplorerOpen: !settings.fileExplorerOpen })
          }
          disabled={!connected}
          title="文件管理器"
          aria-label="切换文件管理器"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
          <span className="topbar-restart-btn__label">文件</span>
        </button>
        <button
          className="topbar-restart-btn"
          onClick={handleRestart}
          disabled={!connected || restarting}
          title="重启 Gateway"
          aria-label="重启 Gateway"
        >
          <svg
            className={restarting ? "topbar-restart-btn__icon--spinning" : ""}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span className="topbar-restart-btn__label">重启</span>
        </button>
        <div className="pill">
          <span className={`statusDot ${versionStatusClass}`} />
          <span>{t("common.version")}</span>
          <span className="mono">{version}</span>
        </div>
        <div className="pill">
          <span className={`statusDot${connected ? " ok" : ""}`} />
          <span>{t("common.health")}</span>
          <span className="mono">{connected ? t("common.ok") : t("common.offline")}</span>
        </div>
      </div>
    </header>
  );
}
