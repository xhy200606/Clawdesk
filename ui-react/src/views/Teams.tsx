import React, { useCallback, useEffect, useMemo, useState } from "react";
import { setTab, syncUrlWithSessionKey } from "../lib/app-settings.ts";
import { loadAgents } from "../lib/controllers/agents.ts";
import { loadChatHistory } from "../lib/controllers/chat.ts";
import { loadSessions } from "../lib/controllers/sessions.ts";
import type { AgentRunTrace } from "../lib/orchestration-traces.ts";
import type { GatewayAgentRow, GatewaySessionRow } from "../lib/types.ts";
import { useAppStore, getReactiveState } from "../store/appStore.ts";

/**
 * Teams（协作工作台）
 *
 * 与「执行编排」的区别：编排看的是**会话父子链**，这里看的是**Agent 之间的协同**：
 *
 *  - 团队视图：每个 Agent 一张卡片（形象 / 状态 / 模型 / 会话数 / 草料），可直接派活、停止、进入会话
 *  - 编排树  ：Agent 之间的层级（主 Agent → 子 Agent 会话），SubAgent 可视化 + 停止入口
 *  - 通信    ：Agent 间互发消息（sessions.send 打到对方主会话），支持群发
 *  - 追踪    ：最近 run 的模型 / 耗时 / 状态
 *
 * 数据来源全部是网关现有 RPC，无后端改动。
 */

type TeamView = "teams" | "flow" | "comms" | "traces";

type AgentStat = {
  id: string;
  name: string;
  emoji: string;
  avatar?: string;
  sessions: GatewaySessionRow[];
  running: number;
  tokens: number;
  model?: string;
  lastActivity: number | null;
  subAgents: number;
};

/** 网关不返回 parentSessionKey / childSessions 时，按 key 约定兜底推断父会话 */
function inferParentKey(key: string): string | null {
  const m = /^agent:([^:]+):(subagent|acp|child|spawn)[:._-]?(.+)$/.exec(key);
  if (m) return `agent:${m[1]}:main`;
  return null;
}

function isSubSession(row: GatewaySessionRow): boolean {
  if (row.parentSessionKey || row.spawnedBy) return true;
  if (typeof row.spawnDepth === "number" && row.spawnDepth > 0) return true;
  return /:(subagent|acp|child|spawn)[:._-]/.test(row.key);
}

function fmtAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function fmtDuration(ms?: number): string {
  if (!ms || ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`;
}

export function TeamsView() {
  const agentsList = useAppStore((s) => s.agentsList);
  const sessionsResult = useAppStore((s) => s.sessionsResult);
  const traces = useAppStore((s) => s.agentRunTraces);
  const client = useAppStore((s) => s.client);
  const connected = useAppStore((s) => s.connected);

  const [view, setView] = useState<TeamView>("teams");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [taskFor, setTaskFor] = useState<string | null>(null);
  const [taskText, setTaskText] = useState("");
  const [commFrom, setCommFrom] = useState("");
  const [commTo, setCommTo] = useState("");
  const [commText, setCommText] = useState("");
  const [commBroadcast, setCommBroadcast] = useState(false);

  // 直接进 /teams 时会话与 Agent 列表可能还没加载过，这里补一次；
  // 并做 15s 轮询，让状态 / 草料 / 子 Agent 变化能自动跟上。
  useEffect(() => {
    const rs = getReactiveState();
    const st = useAppStore.getState();
    if (!st.sessionsResult) void loadSessions(rs as never).catch(() => undefined);
    if (!st.agentsList) void loadAgents(rs as never).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => {
      void loadSessions(getReactiveState() as never).catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [connected]);

  const rows = useMemo(() => sessionsResult?.sessions ?? [], [sessionsResult]);
  const agents = useMemo(() => (agentsList?.agents ?? []) as GatewayAgentRow[], [agentsList]);

  const stats = useMemo<AgentStat[]>(() => {
    const byAgent = new Map<string, GatewaySessionRow[]>();
    for (const row of rows) {
      const id = row.agentId ?? "main";
      const list = byAgent.get(id) ?? [];
      list.push(row);
      byAgent.set(id, list);
    }
    const ids = new Set<string>([...byAgent.keys(), ...agents.map((a) => a.id)]);
    return [...ids].map((id) => {
      const agent = agents.find((a) => a.id === id);
      const sessions = byAgent.get(id) ?? [];
      const running = sessions.filter((s) => s.status === "running" || s.hasActiveRun).length;
      const tokens = sessions.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);
      const lastActivity = sessions.reduce<number | null>(
        (max, s) => (s.updatedAt && (!max || s.updatedAt > max) ? s.updatedAt : max),
        null,
      );
      return {
        id,
        name: agent?.identity?.name || agent?.name || id,
        emoji: agent?.identity?.emoji || (id === "main" ? "🐄" : "🐴"),
        avatar: agent?.identity?.avatar,
        sessions,
        running,
        tokens,
        model: sessions.find((s) => s.model)?.model ?? undefined,
        lastActivity,
        subAgents: sessions.filter(isSubSession).length,
      };
    });
  }, [agents, rows]);

  const mainKeyOf = useCallback(
    (agentId: string) => {
      const own = rows.find((r) => (r.agentId ?? "main") === agentId && !isSubSession(r));
      return own?.key ?? `agent:${agentId}:main`;
    },
    [rows],
  );

  const refresh = useCallback(async () => {
    const rs = getReactiveState();
    try {
      await loadSessions(rs as never);
    } catch {
      /* 忽略：轮询兜底会再拉一次 */
    }
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      if (!client || !connected) {
        setError("网关未连接");
        return;
      }
      setBusy(label);
      setError(null);
      setNotice(null);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      } finally {
        setBusy(null);
      }
    },
    [client, connected, refresh],
  );

  const sendTo = useCallback(
    (key: string, message: string) =>
      run(key, () => client!.request("sessions.send", { key, message })),
    [client, run],
  );

  const abort = useCallback(
    (key: string) => run(`abort:${key}`, () => client!.request("sessions.abort", { key })),
    [client, run],
  );

  const openSession = useCallback((key: string) => {
    const rs = getReactiveState() as unknown as Record<string, unknown>;
    rs.sessionKey = key;
    rs.chatMessage = "";
    rs.chatMessages = [];
    rs.chatStream = null;
    rs.chatRunId = null;
    syncUrlWithSessionKey(rs as never, key, true);
    setTab(rs as never, "chat");
    void loadChatHistory(rs as never);
  }, []);

  const onDispatch = useCallback(
    async (agentId: string) => {
      const text = taskText.trim();
      if (!text) {
        setError("请输入要派发的任务内容");
        return;
      }
      await sendTo(mainKeyOf(agentId), text);
      setNotice(`已派活给「${stats.find((s) => s.id === agentId)?.name ?? agentId}」`);
      setTaskText("");
      setTaskFor(null);
    },
    [mainKeyOf, sendTo, stats, taskText],
  );

  const onSendComm = useCallback(async () => {
    const text = commText.trim();
    if (!text) {
      setError("请输入通信内容");
      return;
    }
    const from = commFrom || "主控";
    if (!commBroadcast && !commTo) {
      setError("请选择接收方 Agent（或勾选群发）");
      return;
    }
    const targets = commBroadcast ? stats.map((s) => s.id) : [commTo];
    const body = `[来自 ${stats.find((s) => s.id === from)?.name ?? from} 的协作请求]\n${text}`;
    await run("comm", async () => {
      for (const id of targets) {
        if (id === from && !commBroadcast) continue;
        await client!.request("sessions.send", { key: mainKeyOf(id), message: body });
      }
    });
    setNotice(`已发送给 ${targets.length} 个 Agent`);
    setCommText("");
  }, [client, commBroadcast, commFrom, commText, commTo, mainKeyOf, run, stats]);

  // ── 编排树：Agent → 主会话 → 子会话 ─────────────────────────────
  const tree = useMemo(() => {
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const children = new Map<string, GatewaySessionRow[]>();
    const parentOf = new Map<string, string>();
    for (const row of rows) {
      const parent = row.parentSessionKey ?? row.spawnedBy ?? inferParentKey(row.key) ?? undefined;
      if (parent && parent !== row.key && byKey.has(parent)) {
        parentOf.set(row.key, parent);
        const list = children.get(parent) ?? [];
        list.push(row);
        children.set(parent, list);
      }
    }
    const roots = rows.filter((r) => !parentOf.has(r.key));
    return { children, roots };
  }, [rows]);

  const renderNode = (row: GatewaySessionRow, depth: number): React.ReactNode => {
    const kids = tree.children.get(row.key) ?? [];
    const running = row.status === "running" || row.hasActiveRun;
    return (
      <div className="teams-tree__node" key={row.key} style={{ marginLeft: depth * 16 }}>
        <div className={`teams-tree__row${running ? " teams-tree__row--running" : ""}`}>
          <span className={`teams-dot${running ? " teams-dot--running" : ""}`} />
          <span className="teams-tree__name" title={row.key}>
            {row.displayName || row.label || row.key}
          </span>
          {isSubSession(row) && <span className="teams-tag teams-tag--sub">SubAgent</span>}
          {row.model && <span className="teams-tag">{row.model}</span>}
          <span className="teams-tree__meta">
            🌾 {row.totalTokens ?? 0}
            {row.runtimeMs ? ` · ${fmtDuration(row.runtimeMs)}` : ""}
            {row.updatedAt ? ` · ${fmtAgo(row.updatedAt)}` : ""}
          </span>
          <span className="teams-tree__actions">
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy !== null}
              onClick={() => void abort(row.key)}
            >
              停止
            </button>
            <button type="button" className="btn btn--sm" onClick={() => openSession(row.key)}>
              会话
            </button>
          </span>
        </div>
        {kids.map((kid) => renderNode(kid, depth + 1))}
      </div>
    );
  };

  const totalRunning = stats.reduce((n, s) => n + s.running, 0);
  const totalTokens = stats.reduce((n, s) => n + s.tokens, 0);
  const totalSubs = stats.reduce((n, s) => n + s.subAgents, 0);

  return (
    <div className="teams">
      <header className="teams__head">
        <div className="teams__title">
          <h1>协作工作台</h1>
          <p>Agent Teams 协同 · SubAgent 可视化 · Agent 间通信</p>
        </div>
        <div className="teams__stats">
          <span className="teams-stat">
            <b>{stats.length}</b>Agent
          </span>
          <span className="teams-stat teams-stat--run">
            <b>{totalRunning}</b>工作中
          </span>
          <span className="teams-stat">
            <b>{totalSubs}</b>子 Agent
          </span>
          <span className="teams-stat">
            <b>{totalTokens.toLocaleString()}</b>草料
          </span>
        </div>
      </header>

      <nav className="teams__tabs">
        {(
          [
            ["teams", "团队"],
            ["flow", "编排树"],
            ["comms", "Agent 通信"],
            ["traces", "运行追踪"],
          ] as Array<[TeamView, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`teams__tab${view === id ? " teams__tab--active" : ""}`}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
        <button type="button" className="btn btn--sm teams__refresh" onClick={() => void refresh()}>
          刷新
        </button>
      </nav>

      {error && <div className="teams__alert teams__alert--err">{error}</div>}
      {notice && <div className="teams__alert teams__alert--ok">{notice}</div>}

      {view === "teams" && (
        <div className="teams__grid">
          {stats.map((stat) => {
            const working = stat.running > 0;
            return (
              <article
                key={stat.id}
                className={`teams-card${working ? " teams-card--working" : ""}`}
              >
                <div className="teams-card__head">
                  <span className="teams-card__avatar">
                    {stat.avatar ? (
                      <img src={stat.avatar} alt={stat.name} />
                    ) : (
                      <span className="teams-card__emoji">{stat.emoji}</span>
                    )}
                  </span>
                  <div className="teams-card__ident">
                    <div className="teams-card__name">{stat.name}</div>
                    <div className="teams-card__id">{stat.id}</div>
                  </div>
                  <span className={`teams-badge${working ? " teams-badge--run" : ""}`}>
                    {working ? "工作中" : "空闲"}
                  </span>
                </div>

                <dl className="teams-card__meta">
                  <div>
                    <dt>模型</dt>
                    <dd>{stat.model ?? "继承默认"}</dd>
                  </div>
                  <div>
                    <dt>会话</dt>
                    <dd>
                      {stat.sessions.length}
                      {stat.subAgents > 0 ? `（子 ${stat.subAgents}）` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>草料</dt>
                    <dd>🌾 {stat.tokens.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>最近活动</dt>
                    <dd>{fmtAgo(stat.lastActivity)}</dd>
                  </div>
                </dl>

                <div className="teams-card__actions">
                  <button
                    type="button"
                    className="btn btn--sm primary"
                    disabled={busy !== null}
                    onClick={() => {
                      setTaskFor(stat.id);
                      setTaskText("");
                      setCommFrom(stat.id);
                    }}
                  >
                    派活
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={busy !== null}
                    onClick={() => void abort(mainKeyOf(stat.id))}
                  >
                    停止
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => openSession(mainKeyOf(stat.id))}
                  >
                    会话
                  </button>
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setView("comms");
                      setCommTo(stat.id);
                    }}
                  >
                    通信
                  </button>
                </div>

                {taskFor === stat.id && (
                  <div className="teams-card__task">
                    <textarea
                      className="teams__textarea"
                      value={taskText}
                      placeholder={`派给「${stat.name}」的任务…`}
                      onChange={(e) => setTaskText(e.target.value)}
                      rows={3}
                    />
                    <div className="teams-card__task-actions">
                      <button
                        type="button"
                        className="btn btn--sm primary"
                        disabled={busy !== null}
                        onClick={() => void onDispatch(stat.id)}
                      >
                        {busy ? "派发中…" : "派发"}
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => setTaskFor(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {stats.length === 0 && (
            <div className="teams__empty">还没有 Agent，去「牛马档案」新建一头吧。</div>
          )}
        </div>
      )}

      {view === "flow" && (
        <div className="teams-tree">
          {tree.roots.length === 0 && <div className="teams__empty">暂无会话</div>}
          {tree.roots.map((row) => renderNode(row, 0))}
        </div>
      )}

      {view === "comms" && (
        <div className="teams-comms">
          <div className="teams-comms__form">
            <label>
              <span>发起方</span>
              <select value={commFrom} onChange={(e) => setCommFrom(e.target.value)}>
                <option value="">主控（我）</option>
                {stats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="teams-comms__arrow">→</span>
            <label>
              <span>接收方</span>
              <select
                value={commTo}
                disabled={commBroadcast}
                onChange={(e) => setCommTo(e.target.value)}
              >
                <option value="">请选择…</option>
                {stats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="teams-comms__check">
              <input
                type="checkbox"
                checked={commBroadcast}
                onChange={(e) => setCommBroadcast(e.target.checked)}
              />
              群发给全部 Agent
            </label>
          </div>
          <textarea
            className="teams__textarea"
            rows={4}
            value={commText}
            placeholder="要让对方 Agent 做什么？（会作为消息发到它的主会话）"
            onChange={(e) => setCommText(e.target.value)}
          />
          <div className="teams-comms__actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy !== null}
              onClick={() => void onSendComm()}
            >
              {busy === "comm" ? "发送中…" : "发送"}
            </button>
            <span className="teams-comms__hint">
              消息走网关 sessions.send，落到对方 Agent 的主会话并触发执行
            </span>
          </div>

          <div className="teams-comms__list">
            <h3>Agent 主会话</h3>
            {stats.map((s) => (
              <div key={s.id} className="teams-comms__row">
                <span className="teams-comms__who">
                  {s.emoji} {s.name}
                </span>
                <code>{mainKeyOf(s.id)}</code>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => openSession(mainKeyOf(s.id))}
                >
                  打开
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "traces" && (
        <div className="teams-traces">
          {traces.length === 0 && <div className="teams__empty">暂无运行记录</div>}
          {traces
            .slice()
            .reverse()
            .slice(0, 40)
            .map((tr: AgentRunTrace) => (
              <div key={tr.runId} className="teams-trace">
                <span className={`teams-dot teams-dot--${tr.status}`} />
                <code className="teams-trace__run">{tr.runId.slice(0, 10)}</code>
                <span className="teams-trace__model">{tr.model ?? tr.provider ?? "—"}</span>
                <span className="teams-trace__dur">
                  {fmtDuration(tr.endedAt ? tr.endedAt - tr.startedAt : undefined)}
                </span>
                <span className="teams-tag">{tr.status}</span>
                {tr.sessionKey && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => openSession(tr.sessionKey!)}
                  >
                    会话
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default TeamsView;
