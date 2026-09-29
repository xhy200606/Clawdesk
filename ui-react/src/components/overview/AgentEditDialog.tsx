import React, { useCallback, useEffect, useRef, useState } from "react";
import { ANIMAL_SPECIES, resolveAgentAppearance } from "../../lib/animals.ts";
import { loadAgents } from "../../lib/controllers/agents.ts";
import { loadConfig, type ConfigState } from "../../lib/controllers/config.ts";
import type { GatewayAgentRow } from "../../lib/types.ts";
import { getReactiveState } from "../../store/appStore.ts";
import { AgentAppearance } from "./AgentAppearance.tsx";

// ─── 牛马档案 · Agent 信息编辑/新增弹窗 ──────────────────────────
// 「资料」页编辑 identity.name / identity.avatar / identity.emoji（动物形象）/ model.primary。
//
// 持久化走网关专用 RPC（实测远快于 config.set + config.apply）：
//  - 新建：agents.create { name, emoji, avatar, model } —— 一次调用直接落库
//    identity + workspace + model（~0.6s）。注意 create 会触发网关内部异步
//    配置管线（~13s），期间 config.set/config.apply/agents.update 都会被
//    卡住或报 not found，所以新建后轮询 agents.list 等运行时可见即可。
//  - 编辑：agents.update { agentId, name, emoji, avatar, model } —— 网关内部
//    应用配置并写 workspace 的 IDENTITY.md（~0.1s），model 传 null 可清空。
//  - 删除：agents.delete { agentId } —— 清配置条目 + 工作区（运行时已同步时很快）。
//
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

/** agents.entries 条目：按 agentId 为键，不含 id 字段；保留其余透传字段 */
type AgentFormEntry = {
  identity?: { name?: string; avatar?: string; emoji?: string; theme?: string };
  model?: { primary?: string };
  [key: string]: unknown;
};

/** 读取 config.agents.entries record（网关合法形状） */
function readAgentEntries(configForm: Record<string, unknown> | null) {
  const agentsObj = configForm?.agents as Record<string, unknown> | undefined;
  return { ...((agentsObj?.entries ?? {}) as Record<string, AgentFormEntry>) };
}

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
  const preview = resolveAgentAppearance({ emoji, avatar }, 0);

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
    const entries = readAgentEntries(reactive.configForm);
    const entry = entries[agent.id];
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
    // 头像是直接写进 openclaw.json 的：原图 data URI 动辄数 MB，会让 config.set /
    // config.apply 极慢甚至超时（表现就是「保存转圈半天最后没生效」）。
    // 先在客户端缩放到 160px 以内再存，通常只有 5~15KB。
    const MAX = 160;
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX / Math.max(img.width || MAX, img.height || MAX));
        const w = Math.max(1, Math.round((img.width || MAX) * scale));
        const h = Math.max(1, Math.round((img.height || MAX) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas 不可用");
        ctx.drawImage(img, 0, 0, w, h);
        setAvatar(canvas.toDataURL("image/jpeg", 0.72));
      } catch {
        // 压缩失败则退回原图，但至少保证可用
        const reader = new FileReader();
        reader.onload = () => setAvatar(String(reader.result ?? ""));
        reader.readAsDataURL(file);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("图片读取失败，请换一张");
    };
    img.src = objectUrl;
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

      // 头像只存压缩后的小图（见 onAvatarFile）；过大的 data URI 会拖慢落盘
      const avatarValue = avatar.trim();
      if (/^data:image\//i.test(avatarValue) && avatarValue.length > 120_000) {
        throw new Error("头像过大（>120KB），请换一张更小的图片或直接用动物形象");
      }
      const emojiValue = emoji.trim() || undefined;
      const trimmedModel = model.trim();

      if (isCreate) {
        // 新建：专用 RPC 一次落库 identity + workspace + model（~0.6s）。
        // 不走 config.set/apply —— create 之后网关内部有 ~13s 的异步配置管线，
        // 紧跟着的 set/apply 会被卡住（这正是之前「保存很慢且失效」的根因）。
        await reactive.client.request("agents.create", {
          name: targetId.trim(),
          ...(emojiValue ? { emoji: emojiValue } : {}),
          ...(avatarValue ? { avatar: avatarValue } : {}),
          ...(trimmedModel ? { model: trimmedModel } : {}),
        });
        // 运行时同步有 1~2s 延迟：轮询 agents.list 直到新牛马可见（最多 ~12s）
        let visible = false;
        for (let i = 0; i < 12 && !visible; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const rows = (await reactive.client.request("agents.list", {})) as {
              agents?: Array<{ id?: string; agentId?: string }>;
            } | null;
            const arr = rows?.agents ?? [];
            visible = arr.some((a) => (a.id ?? a.agentId) === targetId.trim());
          } catch {
            visible = false;
          }
        }
        if (!visible) {
          throw new Error("牛马已创建，但运行时尚未加载（请稍后刷新页面查看）");
        }
        // create 的 name 参数是 agentId；用户填了独立昵称时补一次 update
        const displayName = name.trim();
        if (displayName && displayName !== targetId.trim()) {
          try {
            await reactive.client.request("agents.update", {
              agentId: targetId.trim(),
              name: displayName,
            });
          } catch {
            // 昵称补写失败不阻塞：agent 已创建成功，可稍后在编辑里改
          }
        }
      } else {
        // 编辑：agents.update 网关内部应用配置 + 写 IDENTITY.md（~0.1s），
        // model 传 null 表示清空主模型选择
        await reactive.client.request("agents.update", {
          agentId: agent!.id,
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(emojiValue ? { emoji: emojiValue } : {}),
          ...(avatarValue ? { avatar: avatarValue } : {}),
          ...(trimmedModel ? { model: trimmedModel } : { model: null }),
        });
      }

      // 刷新本地配置快照（hash）与牛马列表
      await loadConfig(reactive);
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
      // agents.delete 一次清掉配置条目 + workspace/agentDir + 绑定；
      // 若该牛马刚创建（运行时管线未同步）可能要等十几秒，属正常现象
      await reactive.client.request("agents.delete", { agentId: agent.id });
      await loadConfig(reactive);
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
              <div className="agent-edit-dialog__appearance-preview">
                <AgentAppearance {...preview} />
                <span>档案与牧场中的主形象预览</span>
              </div>
              <div className="agent-edit-dialog__species">
                {ANIMAL_SPECIES.map((sp) => (
                  <button
                    key={sp.emoji}
                    type="button"
                    className={`agent-edit-dialog__species-btn${emoji === sp.emoji ? " agent-edit-dialog__species-btn--active" : ""}`}
                    disabled={busy}
                    title={sp.label}
                    onClick={() => {
                      setEmoji(sp.emoji);
                      // The gateway requires a non-empty avatar. An animal emoji replaces an old image.
                      setAvatar(sp.emoji);
                    }}
                  >
                    <span className="agent-edit-dialog__species-emoji">{sp.emoji}</span>
                    <span className="agent-edit-dialog__species-label">{sp.label}</span>
                  </button>
                ))}
              </div>
              <span className="agent-edit-dialog__species-hint">
                选中的动物会成为档案主形象，并同步到 2D/3D 牧场
              </span>
            </div>
            <label className="agent-edit-dialog__row">
              <span className="agent-edit-dialog__label">自定义形象图片（可选）</span>
              <span className="agent-edit-dialog__avatar-cell">
                <input
                  className="quick-add__input"
                  value={ANIMAL_SPECIES.some((sp) => sp.emoji === avatar) ? "" : avatar}
                  disabled={busy}
                  onChange={(e) => setAvatar(e.target.value || emoji || "🐄")}
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
                将从配置中移除该牛马（agents.entries）。其 workspace 文件保留在磁盘上，可手动清理。
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
