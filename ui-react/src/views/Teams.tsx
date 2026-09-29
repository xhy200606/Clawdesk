import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setTab, syncUrlWithSessionKey } from "../lib/app-settings.ts";
import { loadAgents } from "../lib/controllers/agents.ts";
import { loadChatHistory } from "../lib/controllers/chat.ts";
import { loadSessions } from "../lib/controllers/sessions.ts";
import type { GatewayAgentRow, GatewaySessionRow } from "../lib/types.ts";
import { useAppStore, getReactiveState } from "../store/appStore.ts";

type WorkState = "working" | "waiting" | "idle" | "completed" | "failed";
type Member = {
  id: string;
  name: string;
  emoji: string;
  avatar?: string;
  model?: string;
  activity?: string;
  sessions: GatewaySessionRow[];
  children: GatewaySessionRow[];
  state: WorkState;
  updatedAt: number | null;
};
type Selection = { kind: "member"; id: string } | { kind: "session"; key: string };

const NODE_W = 184;
const COLUMN_W = 228;

function ownerOf(row: GatewaySessionRow): string {
  return row.agentId ?? /^agent:([^:]+):/.exec(row.key)?.[1] ?? "main";
}

function isChild(row: GatewaySessionRow): boolean {
  return Boolean(
    row.parentSessionKey ||
    row.spawnedBy ||
    (row.spawnDepth ?? 0) > 0 ||
    /:(?:subagent|acp):/.test(row.key),
  );
}

function stateOf(row: GatewaySessionRow, activeTraceSessions: ReadonlySet<string>): WorkState {
  if (activeTraceSessions.has(row.key)) return "working";
  if (row.hasActiveRun || row.status === "running") return "working";
  if ((row.queueDepth ?? 0) > 0) return "waiting";
  if (row.subagentRunState === "failed" || row.subagentRunState === "error") return "failed";
  if (row.subagentRunState === "done" || row.subagentRunState === "completed") return "completed";
  return "idle";
}

function memberState(
  rows: GatewaySessionRow[],
  activeTraceSessions: ReadonlySet<string>,
): WorkState {
  if (rows.some((row) => stateOf(row, activeTraceSessions) === "working")) return "working";
  if (rows.some((row) => stateOf(row, activeTraceSessions) === "waiting")) return "waiting";
  if (rows.some((row) => stateOf(row, activeTraceSessions) === "failed")) return "failed";
  if (rows.length > 0 && rows.every((row) => stateOf(row, activeTraceSessions) === "completed"))
    return "completed";
  return "idle";
}

function stateLabel(state: WorkState): string {
  return {
    working: "执行中",
    waiting: "等待中",
    idle: "空闲",
    completed: "已完成",
    failed: "失败",
  }[state];
}

function age(timestamp: number | null | undefined): string {
  if (!timestamp) return "暂无活动";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "刚刚更新";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} 小时前` : `${Math.floor(hours / 24)} 天前`;
}

function sessionName(row: GatewaySessionRow): string {
  return row.label || row.displayName || (isChild(row) ? `SubAgent ${row.key.slice(-8)}` : row.key);
}

function NodeCard({
  title,
  subtitle,
  role,
  state,
  emoji,
  avatar,
  selected,
  onClick,
}: {
  title: string;
  subtitle: string;
  role: string;
  state: WorkState;
  emoji: string;
  avatar?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`team-flow-node team-flow-node--${state}${selected ? " team-flow-node--selected" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className="team-flow-node__avatar">{avatar ? <img src={avatar} alt="" /> : emoji}</span>
      <span className="team-flow-node__body">
        <small>{role}</small>
        <strong title={title}>{title}</strong>
        <span title={subtitle}>{subtitle}</span>
      </span>
      <span
        className={`team-flow-node__status team-flow-node__status--${state}`}
        title={stateLabel(state)}
      />
    </button>
  );
}

export function TeamsView() {
  const agentsList = useAppStore((state) => state.agentsList);
  const sessionsResult = useAppStore((state) => state.sessionsResult);
  const traces = useAppStore((state) => state.agentRunTraces);
  const connected = useAppStore((state) => state.connected);
  const client = useAppStore((state) => state.client);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [showActivity, setShowActivity] = useState(true);
  // Agent 间通信：写文本 → sessions.send 落到目标成员主会话并触发执行
  const [commsText, setCommsText] = useState("");
  const [commsBroadcast, setCommsBroadcast] = useState(false);
  const [commsBusy, setCommsBusy] = useState(false);
  const [commsNote, setCommsNote] = useState<string | null>(null);
  const [commsLog, setCommsLog] = useState<Array<{ to: string; at: number; text: string }>>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(760);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    resize.observe(viewport);
    return () => resize.disconnect();
  }, []);

  useEffect(() => {
    const state = useAppStore.getState();
    if (!state.sessionsResult) void loadSessions(getReactiveState() as never);
    if (!state.agentsList) void loadAgents(getReactiveState() as never);
  }, []);
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => void loadSessions(getReactiveState() as never), 15_000);
    return () => window.clearInterval(timer);
  }, [connected]);

  const rows = useMemo(() => sessionsResult?.sessions ?? [], [sessionsResult]);
  const activeTraceSessions = useMemo(
    () =>
      new Set(
        traces
          .filter((trace) => trace.status === "running" && trace.sessionKey)
          .map((trace) => trace.sessionKey!),
      ),
    [traces],
  );
  const agents = useMemo(() => (agentsList?.agents ?? []) as GatewayAgentRow[], [agentsList]);
  const leadId = agentsList?.defaultId || agents[0]?.id || "main";
  const members = useMemo<Member[]>(() => {
    const ids = new Set([leadId, ...agents.map((agent) => agent.id), ...rows.map(ownerOf)]);
    return [...ids].map((id) => {
      const agent = agents.find((item) => item.id === id);
      const sessions = rows.filter((row) => ownerOf(row) === id);
      const activeSession = sessions.find((row) => stateOf(row, activeTraceSessions) === "working");
      return {
        id,
        name: agent?.identity?.name || agent?.name || id,
        emoji: agent?.identity?.emoji || (id === leadId ? "🐄" : "🐴"),
        avatar: agent?.identity?.avatar,
        model: sessions.find((row) => row.model)?.model,
        activity: activeSession?.label || activeSession?.displayName || activeSession?.subject,
        sessions,
        children: sessions.filter(isChild),
        state: memberState(sessions, activeTraceSessions),
        updatedAt: sessions.reduce<number | null>(
          (latest, row) =>
            row.updatedAt && (!latest || row.updatedAt > latest) ? row.updatedAt : latest,
          null,
        ),
      };
    });
  }, [activeTraceSessions, agents, leadId, rows]);
  const lead = members.find((member) => member.id === leadId)!;
  const teammates = members.filter((member) => member.id !== leadId);
  const leadKey = `agent:${leadId}:${agentsList?.mainKey || "main"}`;
  const activeCount = members.filter((member) => member.state === "working").length;
  const childCount = members.reduce((sum, member) => sum + member.children.length, 0);

  const openSession = useCallback((key: string) => {
    const host = getReactiveState() as unknown as Record<string, unknown>;
    host.sessionKey = key;
    host.chatMessage = "";
    host.chatMessages = [];
    host.chatStream = null;
    host.chatStreamStartedAt = null;
    host.chatRunId = null;
    host.chatQueue = [];
    useAppStore.getState().applySettings({
      ...useAppStore.getState().settings,
      sessionKey: key,
      lastActiveSessionKey: key,
    });
    syncUrlWithSessionKey(host as never, key, true);
    setTab(host as never, "chat");
    void loadChatHistory(host as never);
  }, []);

  /**
   * Agent 间通信协议：
   *  1. 路由 —— 消息经网关 sessions.send 直达目标成员的主会话
   *     （key = agent:<成员ID>:main），网关收到即触发该成员执行；
   *  2. 广播 —— 逐一向所有其他团队成员的主会话发送同一文本；
   *  3. 层级 —— SubAgent 会话不直接接收通信：它们由成员的主会话
   *     派生（spawn），对 SubAgent 下指令应经由其父成员会话传递。
   */
  const sendComms = useCallback(
    async (targetIds: string[], text: string) => {
      const body = text.trim();
      if (!client || !body || commsBusy) return;
      setCommsBusy(true);
      setCommsNote(null);
      try {
        for (const id of targetIds) {
          await client.request("sessions.send", { key: `agent:${id}:main`, message: body });
        }
        setCommsLog((prev) =>
          [{ to: targetIds.join(", "), at: Date.now(), text: body }, ...prev].slice(0, 8),
        );
        setCommsText("");
        setCommsNote(`已送达 ${targetIds.length} 个成员的主会话`);
      } catch (err) {
        setCommsNote(`发送失败：${String(err instanceof Error ? err.message : err)}`);
      } finally {
        setCommsBusy(false);
      }
    },
    [client, commsBusy],
  );

  const selectedMember =
    selection?.kind === "member" ? members.find((member) => member.id === selection.id) : undefined;
  const selectedSession =
    selection?.kind === "session" ? rows.find((row) => row.key === selection.key) : undefined;
  const hasLeadChildren = lead.children.length > 0;
  const columns = teammates.length + (hasLeadChildren ? 1 : 0);
  const width = Math.max(760, Math.max(columns, 1) * COLUMN_W + 64);
  const height =
    390 +
    Math.max(0, ...teammates.map((member) => member.children.length), lead.children.length - 1) *
      130;
  const columnX = (index: number) =>
    width / 2 - (columns * COLUMN_W) / 2 + index * COLUMN_W + (COLUMN_W - NODE_W) / 2;
  const leadChildX = columnX(0);
  const teammateX = (index: number) => columnX(index + (hasLeadChildren ? 1 : 0));
  const flowScale = Math.min(1, Math.max(0.1, (viewportWidth - 24) / width));

  return (
    <section className="teams-workbench" aria-label="协作工作台">
      <header className="teams-workbench__header">
        <div>
          <span className="teams-workbench__kicker">AGENT TEAMS · 实时协作</span>
          <h1>协作工作台</h1>
          <p>在聊天会话中向主 Agent 提交目标，这里查看任务分配和各 Agent 的执行流程。</p>
        </div>
        <div className="teams-workbench__header-actions">
          <span className={`teams-workbench__connection${connected ? " is-live" : ""}`}>
            {connected ? "实时连接" : "连接中断"}
          </span>
          <button type="button" className="btn primary" onClick={() => openSession(leadKey)}>
            前往主 Agent 聊天
          </button>
        </div>
      </header>
      <div className="teams-workbench__metrics" aria-label="协作状态">
        <div>
          <small>协作阶段</small>
          <strong>
            {activeCount > 1 ? "并行执行" : activeCount === 1 ? "执行中" : "等待任务"}
          </strong>
        </div>
        <div>
          <small>团队成员</small>
          <strong>{members.length}</strong>
        </div>
        <div>
          <small>执行中</small>
          <strong>{activeCount}</strong>
        </div>
        <div>
          <small>SubAgent 会话</small>
          <strong>{childCount}</strong>
        </div>
        <div>
          <small>运行事件</small>
          <strong>{traces.length}</strong>
        </div>
      </div>
      <div className="teams-workbench__body">
        <div className="teams-workbench__canvas-pane">
          <div className="teams-workbench__canvas-head">
            <div>
              <strong>执行流程</strong>
              <span>节点与连线随网关状态更新</span>
            </div>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => void loadSessions(getReactiveState() as never)}
            >
              刷新
            </button>
          </div>
          <div className="teams-workbench__viewport" ref={viewportRef}>
            <div className="team-flow-frame" style={{ height: height * flowScale }}>
              <div style={{ width: width * flowScale, height: height * flowScale, flex: "none" }}>
                <div
                  className="team-flow"
                  style={{ width, height, transform: `scale(${flowScale})` }}
                >
                  <svg
                    className="team-flow__edges"
                    width={width}
                    height={height}
                    aria-hidden="true"
                  >
                    {lead.children.map((child, index) => {
                      const x = leadChildX + NODE_W / 2;
                      const y = 236 + index * 130;
                      const linked =
                        child.parentSessionKey === leadKey || child.spawnedBy === leadKey;
                      return (
                        <path
                          key={child.key}
                          className={`team-flow__edge${linked ? " team-flow__edge--linked" : ""}${stateOf(child, activeTraceSessions) === "working" ? " team-flow__edge--active" : ""}`}
                          d={
                            index === 0
                              ? `M ${width / 2} 160 C ${width / 2} 200, ${x} 200, ${x} ${y}`
                              : `M ${x} ${y - 26} L ${x} ${y}`
                          }
                        />
                      );
                    })}
                    {teammates.map((member, index) => {
                      const x = teammateX(index) + NODE_W / 2;
                      const linked = member.sessions.some(
                        (row) => row.parentSessionKey === leadKey || row.spawnedBy === leadKey,
                      );
                      return (
                        <path
                          key={member.id}
                          className={`team-flow__edge${linked ? " team-flow__edge--linked" : ""}${member.state === "working" ? " team-flow__edge--active" : ""}`}
                          d={`M ${width / 2} 160 C ${width / 2} 200, ${x} 200, ${x} 236`}
                        />
                      );
                    })}
                    {teammates.flatMap((member, index) =>
                      member.children.map((child, childIndex) => {
                        const x = teammateX(index) + NODE_W / 2;
                        const linked = Boolean(child.parentSessionKey || child.spawnedBy);
                        return (
                          <path
                            key={child.key}
                            className={`team-flow__edge${linked ? " team-flow__edge--linked" : ""}${stateOf(child, activeTraceSessions) === "working" ? " team-flow__edge--active" : ""}`}
                            d={`M ${x} 340 L ${x} ${366 + childIndex * 130}`}
                          />
                        );
                      }),
                    )}
                  </svg>
                  <div className="team-flow__stage" style={{ top: 16 }}>
                    01 · 主 Agent 接收与分配
                  </div>
                  <div className="team-flow__stage" style={{ top: 192 }}>
                    02 · Agent 与子会话执行
                  </div>
                  {childCount > 0 && (
                    <div className="team-flow__stage" style={{ top: 354 }}>
                      03 · SubAgent 执行
                    </div>
                  )}
                  <div
                    className="team-flow__position"
                    style={{ left: width / 2 - NODE_W / 2, top: 56 }}
                  >
                    <NodeCard
                      title={lead.name}
                      subtitle={lead.activity || lead.model || "等待协作任务"}
                      role="主 Agent"
                      state={lead.state}
                      emoji={lead.emoji}
                      avatar={lead.avatar}
                      selected={selection?.kind === "member" && selection.id === lead.id}
                      onClick={() => setSelection({ kind: "member", id: lead.id })}
                    />
                  </div>
                  {lead.children.map((child, index) => (
                    <div
                      className="team-flow__position"
                      key={child.key}
                      style={{ left: leadChildX, top: 236 + index * 130 }}
                    >
                      <NodeCard
                        title={sessionName(child)}
                        subtitle={child.model || "子会话"}
                        role="主 Agent 的 SubAgent"
                        state={stateOf(child, activeTraceSessions)}
                        emoji="↳"
                        selected={selection?.kind === "session" && selection.key === child.key}
                        onClick={() => setSelection({ kind: "session", key: child.key })}
                      />
                    </div>
                  ))}
                  {teammates.map((member, index) => (
                    <React.Fragment key={member.id}>
                      <div
                        className="team-flow__position"
                        style={{ left: teammateX(index), top: 236 }}
                      >
                        <NodeCard
                          title={member.name}
                          subtitle={member.activity || member.model || "等待分配"}
                          role="团队成员"
                          state={member.state}
                          emoji={member.emoji}
                          avatar={member.avatar}
                          selected={selection?.kind === "member" && selection.id === member.id}
                          onClick={() => setSelection({ kind: "member", id: member.id })}
                        />
                      </div>
                      {member.children.map((child, childIndex) => (
                        <div
                          className="team-flow__position"
                          key={child.key}
                          style={{ left: teammateX(index), top: 366 + childIndex * 130 }}
                        >
                          <NodeCard
                            title={sessionName(child)}
                            subtitle={child.model || "子会话"}
                            role="SubAgent"
                            state={stateOf(child, activeTraceSessions)}
                            emoji="↳"
                            selected={selection?.kind === "session" && selection.key === child.key}
                            onClick={() => setSelection({ kind: "session", key: child.key })}
                          />
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                  {members.length === 1 && lead.children.length === 0 && (
                    <p className="team-flow__empty">
                      主 Agent 分配任务后，成员和 SubAgent 的执行状态会出现在这里。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="teams-workbench__legend">
            <span>
              <i className="team-flow__legend-line" /> 团队成员
            </span>
            <span>
              <i className="team-flow__legend-line team-flow__legend-line--linked" />{" "}
              已确认的会话关系
            </span>
            <span>
              <i className="team-flow__legend-dot" /> 执行中
            </span>
          </div>
        </div>
        <aside className="teams-workbench__inspector" aria-label="执行详情">
          {selectedMember ? (
            <>
              <div className="teams-workbench__inspector-head">
                <span className="teams-workbench__inspector-avatar">{selectedMember.emoji}</span>
                <div>
                  <small>{selectedMember.id === leadId ? "主 Agent" : "团队成员"}</small>
                  <h2>{selectedMember.name}</h2>
                </div>
                <span
                  className={`teams-workbench__state teams-workbench__state--${selectedMember.state}`}
                >
                  {stateLabel(selectedMember.state)}
                </span>
              </div>
              <dl className="teams-workbench__details">
                <div>
                  <dt>模型</dt>
                  <dd>{selectedMember.model || "继承默认"}</dd>
                </div>
                <div>
                  <dt>会话</dt>
                  <dd>{selectedMember.sessions.length}</dd>
                </div>
                <div>
                  <dt>SubAgent</dt>
                  <dd>{selectedMember.children.length}</dd>
                </div>
                <div>
                  <dt>最近活动</dt>
                  <dd>{age(selectedMember.updatedAt)}</dd>
                </div>
              </dl>
              <h3>相关会话</h3>
              <div className="teams-workbench__session-list">
                {/* 主会话（成员自身）在上 */}
                {selectedMember.sessions
                  .filter((row) => !isChild(row))
                  .map((row) => (
                    <button
                      type="button"
                      key={row.key}
                      onClick={() => setSelection({ kind: "session", key: row.key })}
                    >
                      <span
                        className={`teams-workbench__state-dot teams-workbench__state-dot--${stateOf(row, activeTraceSessions)}`}
                      />
                      <span>{sessionName(row)}</span>
                      <small>主会话 · {stateLabel(stateOf(row, activeTraceSessions))}</small>
                    </button>
                  ))}
                {/* SubAgent 会话从属于成员，不与主会话并列展示 */}
                {selectedMember.children.length > 0 && (
                  <div className="teams-workbench__session-group-label">
                    SubAgent 会话（从属，由主会话派生）
                  </div>
                )}
                {selectedMember.children.map((row) => (
                  <button
                    type="button"
                    key={row.key}
                    className="teams-workbench__session-child"
                    onClick={() => setSelection({ kind: "session", key: row.key })}
                  >
                    <span
                      className={`teams-workbench__state-dot teams-workbench__state-dot--${stateOf(row, activeTraceSessions)}`}
                    />
                    <span>↳ {sessionName(row)}</span>
                    <small>{stateLabel(stateOf(row, activeTraceSessions))}</small>
                  </button>
                ))}
                {selectedMember.sessions.length === 0 && <p>暂无会话</p>}
              </div>

              {/* Agent 间通信面板 */}
              <div className="teams-comms2">
                <h3>Agent 间通信</h3>
                <textarea
                  className="teams-comms2__input"
                  rows={3}
                  value={commsText}
                  placeholder={`写给 ${selectedMember.name} 的主会话，发送后立即触发其执行`}
                  onChange={(e) => setCommsText(e.target.value)}
                />
                {selectedMember.id !== leadId && teammates.length > 1 && (
                  <label className="teams-comms2__option">
                    <input
                      type="checkbox"
                      checked={commsBroadcast}
                      onChange={(e) => setCommsBroadcast(e.target.checked)}
                    />
                    <span>同时广播给其他团队成员</span>
                  </label>
                )}
                <div className="teams-comms2__row">
                  <button
                    type="button"
                    className="btn primary"
                    disabled={commsBusy || !commsText.trim()}
                    onClick={() => {
                      const targets = commsBroadcast
                        ? teammates.map((m) => m.id)
                        : [selectedMember.id];
                      void sendComms(targets, commsText);
                    }}
                  >
                    {commsBusy ? "发送中…" : "发送消息"}
                  </button>
                  {commsNote && <span className="teams-comms2__note">{commsNote}</span>}
                </div>
                <p className="teams-comms2__hint">
                  协议：sessions.send 直达成员主会话并触发执行；SubAgent 不直接接收，
                  指令经其父成员会话向下传递。
                </p>
                {commsLog.length > 0 && (
                  <div className="teams-comms2__log">
                    {commsLog.map((entry, i) => (
                      <div key={i}>
                        <small>
                          → {entry.to} · {age(entry.at)}
                        </small>
                        <span>{entry.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() =>
                  openSession(
                    selectedMember.id === leadId
                      ? leadKey
                      : (selectedMember.sessions.find((row) => !isChild(row))?.key ??
                          `agent:${selectedMember.id}:main`),
                  )
                }
              >
                {selectedMember.id === leadId ? "前往主 Agent 聊天" : "打开成员会话"}
              </button>
            </>
          ) : selectedSession ? (
            <>
              <div className="teams-workbench__inspector-head">
                <span className="teams-workbench__inspector-avatar">↳</span>
                <div>
                  <small>执行会话</small>
                  <h2>{sessionName(selectedSession)}</h2>
                </div>
              </div>
              <dl className="teams-workbench__details">
                <div>
                  <dt>状态</dt>
                  <dd>{stateLabel(stateOf(selectedSession, activeTraceSessions))}</dd>
                </div>
                <div>
                  <dt>模型</dt>
                  <dd>{selectedSession.model || "继承默认"}</dd>
                </div>
                <div>
                  <dt>累计 Token</dt>
                  <dd>{selectedSession.totalTokens?.toLocaleString() ?? "—"}</dd>
                </div>
                <div>
                  <dt>最近活动</dt>
                  <dd>{age(selectedSession.updatedAt)}</dd>
                </div>
              </dl>
              <code className="teams-workbench__session-key">{selectedSession.key}</code>
              <button
                type="button"
                className="btn primary"
                onClick={() => openSession(selectedSession.key)}
              >
                打开执行会话
              </button>
            </>
          ) : (
            <div className="teams-workbench__inspector-empty">
              <strong>选择一个 Agent</strong>
              <p>查看它的运行状态、子会话和最近活动。</p>
            </div>
          )}
          <div className="teams-workbench__activity-head">
            <h3>运行动态</h3>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setShowActivity((value) => !value)}
            >
              {showActivity ? "收起" : "展开"}
            </button>
          </div>
          {showActivity && (
            <div className="teams-workbench__activity" aria-live="polite">
              {traces.slice(0, 20).map((trace) => (
                <button
                  type="button"
                  key={trace.runId}
                  onClick={() =>
                    trace.sessionKey && setSelection({ kind: "session", key: trace.sessionKey })
                  }
                  disabled={!trace.sessionKey}
                >
                  <span
                    className={`teams-workbench__state-dot teams-workbench__state-dot--${trace.status === "running" ? "working" : trace.status === "failed" ? "failed" : "idle"}`}
                  />
                  <span>
                    <strong>{trace.model || trace.provider || "Agent 运行"}</strong>
                    <small>
                      {trace.status === "running"
                        ? "执行中"
                        : trace.status === "failed"
                          ? "失败"
                          : "完成"}{" "}
                      · {age(trace.startedAt)}
                    </small>
                  </span>
                </button>
              ))}
              {traces.length === 0 && <p>等待 Agent 运行事件。</p>}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

export default TeamsView;
