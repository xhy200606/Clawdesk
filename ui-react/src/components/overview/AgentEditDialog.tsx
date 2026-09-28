import React, { useCallback, useEffect, useRef, useState } from "react";
import { ANIMAL_SPECIES } from "../../lib/animals.ts";
import { loadAgents } from "../../lib/controllers/agents.ts";
import {
  applyConfig,
  saveConfig,
  updateConfigFormValue,
  type ConfigState,
} from "../../lib/controllers/config.ts";
import type { GatewayAgentRow } from "../../lib/types.ts";
import { getReactiveState } from "../../store/appStore.ts";

// ─── 牛马档案 · Agent 信息编辑/新增弹窗 ──────────────────────────
// 「资料」页编辑 identity.name / identity.avatar / identity.emoji（动物形象）/ model.primary，
// 写回 configForm.agents.list 对应条目，经 saveConfig + applyConfig 持久化。
// 新建模式：输入新 agentId + 选择动物形象，保存后网关会创建对应 agent。
// 删除：从 agents.list 移除条目（main 等默认 agent 不允许删除）。
// 文件页编辑 workspace 内的 SOUL.md / AGENTS.md / USER.md / IDENTITY.md，
// 走网关 agents.files.get / agents.files.set RPC 直接读写。

type AgentEditDialogProps = {
  open: boolean;
  agent: GatewayAgentRow | null;
  /** true = 新建牛马模式（agent 为 null） */
  createMode?: boolean;
  /** 已存在的 agent id 列表（新建时防重名） */
  existingIds?: string[];
  onClose: () => void;
};

type AgentFormEntry = {
  id: string;
  name?: string;
  identity?: { name?: string; avatar?: string; emoji?: string };
  model?: { primary?: string };
  workspace?: string;
};

/** 可直接编辑的 workspace 文件 */
const EDITABLE_FILES = ["SOUL.md", "AGENTS.md", "USER.md", "IDENTITY.md"] as const;
type EditableFile = (typeof EDITABLE_FILES)[number];

export function AgentEditDialog({
  open,
  agent,
  createMode = false,
  existingIds = [],
  onClose,
}: AgentEditDialogProps) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("");
  const [emoji, setEmoji] = useState("");
  const [model, setModel] = useState("");
  const [newId, setNewId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // 删除确认
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 文件编辑状态
  const [activeTab, setActiveTab] = useState<"profile" | EditableFile>("profile");
  const [fileText, setFileText] = useState<Record<string, string>>({});
  const [fileMissing, setFileMissing] = useState<Record<string, boolean>>({});
  const [fileLoading, setFileLoading] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [fileMsg, setFileMsg] = useState<string | null>(null);

  const isCreate = createMode && !agent;
  const agentId = isCreate ? newId.trim() : (agent?.id ?? "");

  const loadFile = useCallback(async (aid: string, fileName: string) => {
    const reactive = getReactiveState() as unknown as {
      client: { request: (method: string, params: unknown) => Promise<unknown> } | null;
    };
    if (!reactive.client) return;
    setFileLoading(true);
    try {
      const res = (await reactive.client.request("agents.files.get", {
        agentId: aid,
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
    if (!open) return;
    setError(null);
    setFileMsg(null);
    setConfirmDelete(false);
    setActiveTab("profile");
    if (isCreate) {
      setName("");
      setAvatar("");
      setEmoji("🐄");
      setModel("");
      setNewId("");
      setModelOptions([]);
      return;
    }
    if (!agent) return;
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
    setEmoji(entry?.identity?.emoji ?? agent.identity?.emoji ?? "");
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
  }, [open, agent, isCreate, loadFile]);

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

  const listAgentsFromForm = (reactive: ConfigState): AgentFormEntry[] => {
    const agentsObj = (reactive.configForm as Record<string, unknown> | null)?.agents as
      | Record<string, unknown>
      | undefined;
    return [...((agentsObj?.list ?? []) as AgentFormEntry[])];
  };

  const onSave = useCallback(async () => {
    if (busy) return;
    const targetId = (isCreate ? newId : agent?.id) ?? "";
    if (!targetId.trim()) {
      setError("请填写牛马 ID（英文/数字/短横线）");
      return;
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(targetId.trim())) {
      setError("牛马 ID 只能包含英文、数字、下划线或短横线");
      return;
    }
    if (isCreate && existingIds.includes(targetId.trim())) {
      setError(`牛马 ID「${targetId.trim()}」已存在`);
      return;
    }
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
            agentId: targetId.trim(),
            dataUri: avatarValue,
          })) as { path?: string } | null;
          if (res?.path) avatarValue = res.path;
        } catch {
          /* 存失败则原样写 data URI */
        }
      }

      const list = listAgentsFromForm(reactive);
      const idx = list.findIndex((a) => a.id === targetId.trim());
      const entry: AgentFormEntry =
        idx >= 0
          ? { ...list[idx], identity: { ...(list[idx].identity ?? {}) } }
          : { id: targetId.trim(), identity: {} };
      entry.identity = {
        ...entry.identity,
        name: name.trim() || targetId.trim(),
        avatar: avatarValue,
        emoji: emoji.trim() || undefined,
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
      await loadAgents(getReactiveState() as unknown as Parameters<typeof loadAgents>[0]);
      onClose();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }, [agent, avatar, busy, emoji, model, name, newId, isCreate, existingIds, onClose]);

  const onDelete = useCallback(async () => {
    if (!agent || busy) return;
    setBusy(true);
    setError(null);
    try {
      const reactive = getReactiveState() as unknown as ConfigState & {
        client: { request: (method: string, params: unknown) => Promise<unknown> } | null;
      };
      if (!reactive.client) throw new Error("网关未连接");
      const list = listAgentsFromForm(reactive).filter((a) => a.id !== agent.id);
      updateConfigFormValue(reactive, ["agents", "list"], list);
      await new Promise((r) => setTimeout(r, 50));
      await saveConfig(reactive);
      await applyConfig(reactive);
      await loadAgents(getReactiveState() as unknown as Parameters<typeof loadAgents>[0]);
      onClose();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }, [agent, busy, onClose]);

  if (!open) return null;

  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !busy && !fileBusy) onClose();
  };

  return (
    <div className="confirm-dialog__overlay" onClick={onOverlayClick}>
      <div className="confirm-dialog agent-edit-dialog" role="dialog" aria-modal="true">
        <div className="confirm-dialog__title">
          {isCreate ? "新增牛马" : `编辑牛马资料 · ${agent?.id ?? ""}`}
        </div>

        {/* Tab 栏：资料 / workspace 文件（新建模式只有资料页） */}
        <div className="agent-edit-dialog__tabs">
          <button
            type="button"
            className={`agent-edit-dialog__tab${activeTab === "profile" ? " agent-edit-dialog__tab--active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            资料
          </button>
          {!isCreate &&
            EDITABLE_FILES.map((fileName) => (
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
            {isCreate && (
              <label className="agent-edit-dialog__row">
                <span className="agent-edit-dialog__label">牛马 ID</span>
                <input
                  className="quick-add__input"
                  value={newId}
                  disabled={busy}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="例如：herd-coder（创建后不可修改）"
                />
              </label>
            )}
            <label className="agent-edit-dialog__row">
              <span className="agent-edit-dialog__label">显示名称</span>
              <input
                className="quick-add__input"
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                placeholder={isCreate ? newId || "牛马 ID" : (agent?.id ?? "")}
              />
            </label>
            <div className="agent-edit-dialog__row">
              <span className="agent-edit-dialog__label">动物形象</span>
              <div className="agent-edit-dialog__species">
                {ANIMAL_SPECIES.map((sp) => (
                  <button
                    key={sp.emoji}
                    type="button"
                    className={`agent-edit-dialog__species-btn${emoji === sp.emoji ? " agent-edit-dialog__species-btn--active" : ""}`}
                    disabled={busy}
                    title={sp.label}
                    onClick={() => setEmoji(sp.emoji)}
                  >
                    <span className="agent-edit-dialog__species-emoji">{sp.emoji}</span>
                    <span className="agent-edit-dialog__species-label">{sp.label}</span>
                  </button>
                ))}
              </div>
              <span className="agent-edit-dialog__species-hint">
                形象会同步到牧场 2D/3D 与档案头像动画
              </span>
            </div>
            <label className="agent-edit-dialog__row">
              <span className="agent-edit-dialog__label">头像（可选）</span>
              <span className="agent-edit-dialog__avatar-cell">
                <input
                  className="quick-add__input"
                  value={avatar}
                  disabled={busy}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="图片 URL / 上传图片；留空则用动物形象"
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
          {/* 危险区：删除（仅编辑模式） */}
          {!isCreate && agent && activeTab === "profile" && (
            <button
              className="btn danger"
              style={{ marginRight: "auto" }}
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              删除该牛马
            </button>
          )}
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
              disabled={busy || (isCreate && !newId.trim())}
              onClick={() => void onSave()}
            >
              {busy ? "保存中…" : isCreate ? "创建" : "保存"}
            </button>
          )}
        </div>

        {/* 删除二次确认 */}
        {confirmDelete && agent && (
          <div className="confirm-dialog__overlay agent-edit-dialog__confirm-overlay">
            <div className="confirm-dialog">
              <div className="confirm-dialog__title">确认删除牛马「{agent.id}」？</div>
              <p className="agent-edit-dialog__confirm-text">
                将从配置中移除该牛马（agents.list）。其 workspace 文件保留在磁盘上，可手动清理。
              </p>
              <div className="confirm-dialog__actions">
                <button
                  className="btn confirm-dialog__cancel"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  取消
                </button>
                <button className="btn danger" disabled={busy} onClick={() => void onDelete()}>
                  {busy ? "删除中…" : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
