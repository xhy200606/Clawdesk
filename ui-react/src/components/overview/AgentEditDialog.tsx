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
// 「资料」页编辑 identity.name / identity.avatar / model.primary，
// 写回 configForm.agents.list 对应条目，经 saveConfig + applyConfig 持久化。
// 文件页编辑 workspace 内的 SOUL.md / AGENTS.md / USER.md / IDENTITY.md，
// 走网关 agents.files.get / agents.files.set RPC 直接读写。

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

/** 可直接编辑的 workspace 文件 */
const EDITABLE_FILES = ["SOUL.md", "AGENTS.md", "USER.md", "IDENTITY.md"] as const;
type EditableFile = (typeof EDITABLE_FILES)[number];

export function AgentEditDialog({ open, agent, onClose }: AgentEditDialogProps) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // 文件编辑状态
  const [activeTab, setActiveTab] = useState<"profile" | EditableFile>("profile");
  const [fileText, setFileText] = useState<Record<string, string>>({});
  const [fileMissing, setFileMissing] = useState<Record<string, boolean>>({});
  const [fileLoading, setFileLoading] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMsg, setFileMsg] = useState<string | null>(null);

  const loadFile = useCallback(async (agentId: string, fileName: string) => {
    const reactive = getReactiveState() as unknown as {
      client: { request: (method: string, params: unknown) => Promise<unknown> } | null;
    };
    if (!reactive.client) return;
    setFileLoading(true);
    try {
      const res = (await reactive.client.request("agents.files.get", {
        agentId,
        name: fileName,
      })) as { file?: { content?: string; missing?: boolean } } | null;
      setFileText((prev) => ({
        ...prev,
        [fileName]: res?.file?.content ?? "",
      }));
      setFileMissing((prev) => ({ ...prev, [fileName]: Boolean(res?.file?.missing) }));
    } catch (err) {
      setFileMsg(`${fileName} 读取失败：${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setFileLoading(false);
    }
  }, []);

  // 打开时初始化资料 + 预取全部文件
  useEffect(() => {
    if (!open || !agent) return;
    setError(null);
    setFileMsg(null);
    setActiveTab("profile");
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

    // 预取全部可编辑文件
    for (const fileName of EDITABLE_FILES) {
      void loadFile(agent.id, fileName);
    }
  }, [open, agent, loadFile]);

  const pickAvatarFile = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const onAvatarFile = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAvatar(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  }, []);

  const onSaveFile = useCallback(
    async (fileName: EditableFile) => {
      if (!agent || fileBusy) return;
      setFileBusy(true);
      setFileMsg(null);
      try {
        const reactive = getReactiveState() as unknown as {
          client: { request: (method: string, params: unknown) => Promise<unknown> } | null;
        };
        if (!reactive.client) throw new Error("网关未连接");
        await reactive.client.request("agents.files.set", {
          agentId: agent.id,
          name: fileName,
          content: fileText[fileName] ?? "",
        });
        setFileMissing((prev) => ({ ...prev, [fileName]: false }));
        setFileMsg(`${fileName} 已保存`);
      } catch (err) {
        setFileMsg(`${fileName} 保存失败：${String(err instanceof Error ? err.message : err)}`);
      } finally {
        setFileBusy(false);
      }
    },
    [agent, fileBusy, fileText],
  );

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
    if (e.target === e.currentTarget && !busy && !fileBusy) onClose();
  };

  return (
    <div className="confirm-dialog__overlay" onClick={onOverlayClick}>
      <div className="confirm-dialog agent-edit-dialog" role="dialog" aria-modal="true">
        <div className="confirm-dialog__title">编辑牛马资料 · {agent.id}</div>

        {/* Tab 栏：资料 / workspace 文件 */}
        <div className="agent-edit-dialog__tabs">
          <button
            type="button"
            className={`agent-edit-dialog__tab${activeTab === "profile" ? " agent-edit-dialog__tab--active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            资料
          </button>
          {EDITABLE_FILES.map((fileName) => (
            <button
              key={fileName}
              type="button"
              className={`agent-edit-dialog__tab${activeTab === fileName ? " agent-edit-dialog__tab--active" : ""}`}
              onClick={() => {
                setActiveTab(fileName);
                setFileMsg(null);
              }}
            >
              {fileName}
              {fileMissing[fileName] ? " *" : ""}
            </button>
          ))}
        </div>

        {activeTab === "profile" ? (
          /* ── 资料页 ── */
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
        ) : (
          /* ── 文件编辑页 ── */
          <div className="agent-edit-dialog__form">
            <>
              <div className="agent-edit-dialog__file-toolbar">
                <span className="agent-edit-dialog__label">
                  {activeTab}
                  {fileMissing[activeTab] ? "（尚未创建，保存后新建）" : ""}
                  {fileLoading ? " · 读取中…" : ""}
                </span>
                <button
                  type="button"
                  className="btn btn--sm primary"
                  disabled={fileBusy || fileLoading}
                  onClick={() => void onSaveFile(activeTab)}
                >
                  {fileBusy ? "保存中…" : "保存文件"}
                </button>
              </div>
              <textarea
                className="agent-edit-dialog__file-editor"
                value={fileText[activeTab] ?? ""}
                disabled={fileBusy || fileLoading}
                onChange={(e) => setFileText((prev) => ({ ...prev, [activeTab]: e.target.value }))}
                spellCheck={false}
              />
              {fileMsg && <div className="agent-edit-dialog__error">{fileMsg}</div>}
            </>
          </div>
        )}

        <div className="confirm-dialog__actions">
          <button
            className="btn confirm-dialog__cancel"
            disabled={busy || fileBusy}
            onClick={onClose}
          >
            关闭
          </button>
          {activeTab === "profile" && (
            <button
              className="btn confirm-dialog__ok"
              disabled={busy}
              onClick={() => void onSave()}
            >
              {busy ? "保存中…" : "保存"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
