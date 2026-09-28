import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyGatewayToSettings,
  listGateways,
  removeGateway,
  saveCurrentAsGateway,
  upsertGateway,
} from "../../lib/controllers/gateways.ts";
import type { UiSettings } from "../../lib/storage.ts";
import { DragHandle } from "./AccessCard.tsx";

// ─── 最新版本检测（npm registry） ────────────────────────────
// 优先 npmmirror（国内快），失败回退 npmjs（带 CORS）。6 秒超时。

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function useLatestGatewayVersion(): { latest: string | null; loading: boolean } {
  const [latest, setLatest] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const urls = [
      "https://registry.npmmirror.com/openclaw/latest",
      "https://registry.npmjs.org/openclaw/latest",
    ];
    (async () => {
      for (const u of urls) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 6000);
          const r = await fetch(u, { signal: ctrl.signal });
          clearTimeout(timer);
          if (r.ok) {
            const j = (await r.json()) as { version?: string };
            if (alive && j?.version && typeof j.version === "string") {
              setLatest(j.version);
              setLoading(false);
              return;
            }
          }
        } catch {
          /* 尝试下一个源 */
        }
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { latest, loading };
}

// ─── 可嵌入字段区（牧场大门卡片内也复用） ────────────────────

export type GatewayFieldsProps = {
  settings: UiSettings;
  connected: boolean;
  helloVersion?: string | null;
  onSettingsChange: (next: UiSettings) => void;
  onReconnect: () => void;
};

export function GatewayFields({
  settings,
  connected,
  helloVersion,
  onSettingsChange,
  onReconnect,
}: GatewayFieldsProps) {
  const gateways = useMemo(() => listGateways(settings), [settings]);
  const activeId = settings.activeGatewayId ?? gateways[0]?.id ?? "default";
  const active = gateways.find((g) => g.id === activeId) ?? gateways[0];

  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [editing, setEditing] = useState(false);
  const { latest, loading } = useLatestGatewayVersion();

  const versionText = helloVersion ?? (connected ? "未知" : "—");
  const versionDiff = latest && helloVersion ? compareVersions(helloVersion, latest) : null;
  const upToDate = versionDiff !== null ? versionDiff >= 0 : null;

  const switchTo = useCallback(
    (id: string) => {
      onSettingsChange(applyGatewayToSettings(settings, id));
      onReconnect();
    },
    [settings, onSettingsChange, onReconnect],
  );

  const startEdit = useCallback(
    (id: string) => {
      const g = gateways.find((x) => x.id === id);
      if (!g) {
        return;
      }
      setDraftName(g.name);
      setDraftUrl(g.url);
      setDraftToken(g.token);
      setEditing(true);
    },
    [gateways],
  );

  const saveDraft = useCallback(() => {
    if (!draftUrl.trim()) {
      return;
    }
    const isEdit = editing && active;
    onSettingsChange(
      upsertGateway(settings, {
        id: isEdit ? active.id : undefined,
        name: draftName || draftUrl,
        url: draftUrl,
        token: draftToken,
      }),
    );
    setEditing(false);
    setDraftName("");
    setDraftUrl("");
    setDraftToken("");
    onReconnect();
  }, [draftName, draftUrl, draftToken, editing, active, settings, onSettingsChange, onReconnect]);

  const addNew = useCallback(() => {
    setDraftName("");
    setDraftUrl("");
    setDraftToken("");
    setEditing(false);
  }, []);

  const removeActive = useCallback(() => {
    if (!active) {
      return;
    }
    onSettingsChange(removeGateway(settings, active.id));
    onReconnect();
  }, [active, settings, onSettingsChange, onReconnect]);

  const saveCurrent = useCallback(() => {
    onSettingsChange(saveCurrentAsGateway(settings, ""));
    setEditing(false);
  }, [settings, onSettingsChange]);

  return (
    <>
      <div className="access-grid access-grid--compact" style={{ marginTop: 10 }}>
        <label className="field">
          <span>当前网关</span>
          <select value={active?.id ?? ""} onChange={(e) => switchTo(e.target.value)}>
            {gateways.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} — {g.url}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>网关版本 / 最新版本</span>
          <div className="gw-version-row">
            <input
              type="text"
              className="gw-version-row__current"
              readOnly
              value={versionText}
              title="当前连接的网关版本"
            />
            <span
              className={`pill gw-version-row__latest${upToDate === false ? " warn" : ""}`}
              title={
                upToDate === false
                  ? `有新版本 ${latest} 可更新`
                  : upToDate === true
                    ? "已是最新版本"
                    : "正在查询 npm registry"
              }
            >
              {loading || !latest ? (
                "查询中…"
              ) : (
                <>
                  最新 <span className="mono">{latest}</span>
                  {upToDate === true ? " ✓" : upToDate === false ? " ⟳可更新" : ""}
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {editing || draftUrl ? (
        <div className="access-grid access-grid--compact" style={{ marginTop: 8 }}>
          <label className="field">
            <span>名称</span>
            <input
              type="text"
              value={draftName}
              placeholder="例如：生产网关"
              onChange={(e) => setDraftName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>WebSocket URL</span>
            <input
              type="text"
              value={draftUrl}
              placeholder="ws://192.168.1.205:18789"
              onChange={(e) => setDraftUrl(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Token</span>
            <input
              type="text"
              value={draftToken}
              placeholder="网关访问令牌"
              onChange={(e) => setDraftToken(e.target.value)}
            />
          </label>
        </div>
      ) : null}

      <div
        className="row"
        style={{ marginTop: 8, marginBottom: 0, display: "flex", gap: 6, flexWrap: "wrap" }}
      >
        <button className="btn btn--sm" onClick={addNew}>
          新增网关
        </button>
        {active ? (
          <button className="btn btn--sm" onClick={() => startEdit(active.id)}>
            编辑当前
          </button>
        ) : null}
        {draftUrl ? (
          <button className="btn btn--sm primary" onClick={saveDraft}>
            保存并连接
          </button>
        ) : null}
        <button className="btn btn--sm" onClick={saveCurrent}>
          另存当前连接
        </button>
        {gateways.length > 1 && active ? (
          <button className="btn btn--sm danger" onClick={removeActive}>
            删除当前
          </button>
        ) : null}
      </div>
    </>
  );
}

export type GatewayCardProps = {
  settings: UiSettings;
  connected: boolean;
  helloVersion?: string | null;
  onSettingsChange: (next: UiSettings) => void;
  onReconnect: () => void;
};

/** 独立网关连接卡片（现已合并进牧场大门，保留以兼容独立使用） */
export function GatewayCard(props: GatewayCardProps) {
  const { connected } = props;
  return (
    <div data-swapy-slot="gateways">
      <div data-swapy-item="gateways">
        <div className="card ov-card--gateways">
          <div className="card-header-row">
            <DragHandle />
            <div>
              <div className="card-title">网关连接</div>
              <div className="card-sub">管理多个 OpenClaw 网关 · token 鉴权</div>
            </div>
            <span
              className="pill"
              style={{
                marginLeft: "auto",
                color: connected ? "var(--color-success, #1D9E75)" : "#A32D2D",
              }}
            >
              {connected ? "已连接" : "未连接"}
            </span>
          </div>
          <GatewayFields {...props} />
        </div>
      </div>
    </div>
  );
}
