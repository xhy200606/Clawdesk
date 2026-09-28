import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  applyConfig,
  saveConfig,
  updateConfigFormValue,
  type ConfigState,
} from "../../lib/controllers/config.ts";
import type { GatewayAgentRow } from "../../lib/types.ts";
import { getReactiveState } from "../../store/appStore.ts";

// ─── 牛马档案 · Agent 信息编辑弹窗 ──────────────────────────────
// 编辑 identity.name / identity.avatar / model.primary，写回 configForm.agents.list
// 中对应条目（不存在则创建），经 saveConfig + applyConfig 持久化到网关。

type AgentEditDialogProps = {
  open: boolean;
  agent: GatewayAgentRow | null;
  onClose: () => void;
};

type AgentFormEntry = {
  id: string;
  identity?: { name?: string; avatar?: string };
  model?: { primary?: string };
  workspace?: string;
};

export function AgentEditDialog({ open, agent, onClose }: AgentEditDialogProps) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // 打开时从 configForm（优先）与 roster 行初始化
  useEffect(() => {
    if (!open || !agent) return;
    setError(null);
    const reactive = getReactiveState() as unknown as {
      configForm: Record<string, unknown> | null;
    };
    const agentsObj = (reactive.configForm as Record<string, unknown> | null)?.agents as
      | Record<string, unknown>
      | undefined;
    const list = (agentsObj?.list ?? []) as AgentFormEntry[];
    const entry = list.find((a) => a.id === agent.id);
    setName(entry?.identity?.name ?? agent.identity?.name ?? agent.id);
    setAvatar(entry?.identity?.avatar ?? agent.identity?.avatar ?? "");
    setModel(entry?.model?.primary ?? "");

    // 模型候选列表（供 datalist 提示）
    const providersObj = (reactive.configForm as Record<string, unknown> | null)?.models as
      | Record<string, unknown>
      | undefined;
    const provs = (providersObj?.providers ?? {}) as Record<
      string,
      { models?: Array<{ id: string; name?: string }> }
    >;
    const opts: Array<{ value: string; label: string }> = [];
    for (const [provId, prov] of Object.entries(provs)) {
      for (const m of prov.models ?? []) {
        opts.push({ value: `${provId}/${m.id}`, label: m.name || m.id });
      }
    }
    setModelOptions(opts);
  }, [open, agent]);

  const pickAvatarFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onAvatarFile = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }, []);

  const onSave = useCallback(async () => {
    if (!agent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const reactive = getReactiveState() as unknown as ConfigState & {
        client: { request: (method: string, params: unknown) => Promise<unknown> } | null;
      };
      if (!reactive.client) throw new Error("网关未连接");

      let avatarValue = avatar.trim();
      // data URI 头像走 RPC 存成文件，避免配置膨胀
      if (/^data:image\//i.test(avatarValue)) {
        try {
          const res = (await reactive.client.request("agent.avatar.save", {
            agentId: agent.id,
            dataUri: avatarValue,
          })) as { path?: string } | null;
          if (res?.path) avatarValue = res.path;
        } catch {
          /* 存失败则原样写 data URI */
        }
      }

      const agentsObj = (reactive.configForm as Record<string, unknown> | null)?.agents as
        | Record<string, unknown>
        | undefined;
      const list = [...((agentsObj?.list ?? []) as AgentFormEntry[])];
      const idx = list.findIndex((a) => a.id === agent.id);
      const entry: AgentFormEntry =
        idx >= 0
          ? { ...list[idx], identity: { ...(list[idx].identity ?? {}) } }
          : { id: agent.id, identity: {} };
      entry.identity = {
        ...entry.identity,
        name: name.trim() || agent.id,
        avatar: avatarValue,
      };
      const trimmedModel = model.trim();
      if (trimmedModel) {
        entry.model = { ...(entry.model ?? {}), primary: trimmedModel };
      } else {
        delete entry.model;
      }
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);

      updateConfigFormValue(reactive, ["agents", "list"], list);
      await new Promise((r) => setTimeout(r, 50));
      await saveConfig(reactive);
      await applyConfig(reactive);
      onClose();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }, [agent, avatar, busy, model, name, onClose]);

  if (!open || !agent) return null;

  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !busy) onClose();
  };

  return (
    <div className="confirm-dialog__overlay" onClick={onOverlayClick}>
      <div className="confirm-dialog agent-edit-dialog" role="dialog" aria-modal="true">
        <div className="confirm-dialog__title">编辑牛马资料 · {agent.id}</div>
        <div className="agent-edit-dialog__form">
          <label className="agent-edit-dialog__row">
            <span className="agent-edit-dialog__label">显示名称</span>
            <input
              className="quick-add__input"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder={agent.id}
            />
          </label>
          <label className="agent-edit-dialog__row">
            <span className="agent-edit-dialog__label">头像</span>
            <span className="agent-edit-dialog__avatar-cell">
              <input
                className="quick-add__input"
                value={avatar}
                disabled={busy}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="emoji / 图片 URL / 上传图片"
              />
              <button
                type="button"
                className="btn agent-edit-dialog__upload"
                disabled={busy}
                onClick={pickAvatarFile}
              >
                上传
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => onAvatarFile(e.target.files?.[0] ?? null)}
              />
            </span>
          </label>
          <label className="agent-edit-dialog__row">
            <span className="agent-edit-dialog__label">主模型</span>
            <input
              className="quick-add__input"
              value={model}
              disabled={busy}
              onChange={(e) => setModel(e.target.value)}
              list="agent-edit-model-options"
              placeholder="留空则继承默认模型"
            />
            <datalist id="agent-edit-model-options">
              {modelOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </datalist>
          </label>
          {error && <div className="agent-edit-dialog__error">{error}</div>}
        </div>
        <div className="confirm-dialog__actions">
          <button className="btn confirm-dialog__cancel" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button className="btn confirm-dialog__ok" disabled={busy} onClick={() => void onSave()}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
