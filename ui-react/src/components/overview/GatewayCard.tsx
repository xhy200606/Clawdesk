import React, { useCallback, useMemo, useState } from "react";
import {
  applyGatewayToSettings,
  listGateways,
  removeGateway,
  saveCurrentAsGateway,
  upsertGateway,
} from "../../lib/controllers/gateways.ts";
import type { UiSettings } from "../../lib/storage.ts";
import { DragHandle } from "./AccessCard.tsx";

export type GatewayCardProps = {
  settings: UiSettings;
  connected: boolean;
  helloVersion?: string | null;
  onSettingsChange: (next: UiSettings) => void;
  onReconnect: () => void;
};

export function GatewayCard(props: GatewayCardProps) {
  const { settings, connected, helloVersion, onSettingsChange, onReconnect } = props;

  const gateways = useMemo(() => listGateways(settings), [settings]);
  const activeId = settings.activeGatewayId ?? gateways[0]?.id ?? "default";
  const active = gateways.find((g) => g.id === activeId) ?? gateways[0];

  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [editing, setEditing] = useState(false);

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

          <div className="access-grid" style={{ marginTop: 14 }}>
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
            <label className="field">
              <span>网关版本</span>
              <input type="text" readOnly value={helloVersion ?? (connected ? "未知" : "—")} />
            </label>
          </div>

          {editing || draftUrl ? (
            <div className="access-grid" style={{ marginTop: 10 }}>
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

          <div className="row" style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={addNew}>
              新增网关
            </button>
            {active ? (
              <button className="btn" onClick={() => startEdit(active.id)}>
                编辑当前
              </button>
            ) : null}
            {draftUrl ? (
              <button className="btn primary" onClick={saveDraft}>
                保存并连接
              </button>
            ) : null}
            <button className="btn" onClick={saveCurrent}>
              另存当前连接
            </button>
            {gateways.length > 1 && active ? (
              <button className="btn danger" onClick={removeActive}>
                删除当前
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
