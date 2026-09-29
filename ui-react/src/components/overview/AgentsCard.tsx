import React, { useState } from "react";
import { formatRelativeTimestamp } from "../../lib/format.ts";
import type { GatewayAgentRow, SessionActivityResult } from "../../lib/types.ts";
import { AgentAnimal } from "./AgentAnimal.tsx";
import { AgentEditDialog } from "./AgentEditDialog.tsx";
import { OverviewIcons } from "./SnapshotCard.tsx";

// ─── Drag Handle（仅允许通过手柄拖拽，卡片其它区域正常交互）──

function DragHandleFree() {
  return (
    <button className="swapy-handle" data-swapy-handle title="拖拽交换位置">
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

// ─── State helpers ───────────────────────────────────────────

function AgentStateLabel({ state }: { state: "processing" | "waiting" | "idle" }) {
  if (state === "processing") return <>{OverviewIcons.running(12)} 奔跑中</>;
  if (state === "waiting") return <>{OverviewIcons.hourglass(12)} 等活中</>;
  return <>{OverviewIcons.moon(12)} 摸鱼中</>;
}

function SessionStateIcon({ state }: { state: string }) {
  if (state === "processing") return OverviewIcons.running(11);
  if (state === "waiting") return OverviewIcons.hourglass(11);
  return OverviewIcons.moon(11);
}

// ─── Channel icon map ────────────────────────────────────────

const CHANNEL_ICON_MAP: Record<string, string> = {
  telegram: "/Telegram_(software)-Logo.wine.svg",
  whatsapp: "/whatsapp-color-svgrepo-com.svg",
  discord: "/discord-svgrepo-com.svg",
  feishu: "/feishu-logo.svg",
};

// ─── Types ───────────────────────────────────────────────────

export type AgentsCardProps = {
  agents: GatewayAgentRow[];
  sessionActivity?: SessionActivityResult | null;
  /** 会话列表（sessions.list），用于工作状态判定与会话详情 */
  sessions?: Array<{
    key: string;
    agentId?: string;
    status?: string;
    state?: string;
    lastActivityAgo?: number;
    queueDepth?: number;
    totalTokens?: number | null;
    contextTokens?: number | null;
    contextUsage?: {
      state: "available" | "unavailable";
      promptTokens?: number;
      totalTokens?: number;
    };
  }> | null;
  channelBindings?: Record<string, string[]>;
};

// ─── Main Component ──────────────────────────────────────────

export function AgentsCard({ agents, sessions, channelBindings }: AgentsCardProps) {
  const [editingAgent, setEditingAgent] = useState<GatewayAgentRow | null>(null);
  const [creating, setCreating] = useState(false);
  // [version-adapt] 网关 2026.9.x 无 sessions.activity RPC，改用 sessions.list 的 status 字段
  const allSessions = sessions ?? [];
  const runningSessions = allSessions.filter((x) => x.status === "running");
  const runningCount = runningSessions.length;
  const idleCount = Math.max(
    agents.length -
      new Set(runningSessions.map((x) => x.agentId ?? x.key.split(":")[1] ?? "")).size,
    0,
  );
  return (
    <div data-swapy-slot="agents">
      <div data-swapy-item="agents">
        <div className="card">
          <div className="card-header-row">
            <DragHandleFree />
            <div>
              <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {OverviewIcons.cow()} 牛马档案
              </div>
              <div className="card-sub" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {agents.length} 头牛马已就位
                {" · "}
                {OverviewIcons.running()} {runningCount} {OverviewIcons.moon()} {idleCount}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--sm primary"
              style={{ marginLeft: "auto" }}
              onClick={() => setCreating(true)}
              title="新增一头牛马"
            >
              + 新增牛马
            </button>
          </div>
          <div className="ov-agent-grid">
            {agents.map((agent) => {
              const displayName = agent.identity?.name ?? agent.name ?? agent.id;
              const agentSessions = allSessions.filter(
                (x) => (x.agentId ?? x.key.split(":")[1] ?? x.key) === agent.id,
              );
              const agentState: "processing" | "waiting" | "idle" = agentSessions.some(
                (x) => x.status === "running",
              )
                ? "processing"
                : "idle";
              const channels = channelBindings?.[agent.id] ?? [];

              return (
                <div key={agent.id} className={`agent-card-pixel agent-card-pixel--${agentState}`}>
                  {/* ── Card Header: Name + State ── */}
                  <div className="agent-card-pixel__header">
                    <div className="agent-card-pixel__name-row">
                      <span className="agent-card-pixel__name">{displayName}</span>
                      <span
                        className={`agent-card-pixel__badge agent-card-pixel__badge--${agentState}`}
                      >
                        <AgentStateLabel state={agentState} />
                      </span>
                      <button
                        type="button"
                        className="agent-card-pixel__edit"
                        title="编辑牛马资料"
                        onClick={() => setEditingAgent(agent)}
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                    </div>
                    <div className="agent-card-pixel__id">{agent.id}</div>
                  </div>

                  {/* The saved animal or custom picture is the main portrait. */}
                  <div className="agent-card-pixel__portrait">
                    <div
                      className={`agent-card-pixel__avatar-ring agent-card-pixel__avatar-ring--${agentState}`}
                    >
                      <AgentAnimal
                        state={agentState}
                        emoji={agent.identity?.emoji}
                        avatar={agent.identity?.avatar}
                        avatarUrl={agent.identity?.avatarUrl}
                        idx={agents.indexOf(agent)}
                        size={156}
                      />
                    </div>
                  </div>

                  {/* ── Stats Panel: Channels ──
                      （会话列表已按需求移除：拓扑关系页已覆盖会话展示，档案只保留形象/渠道） */}
                  <div className="agent-card-pixel__stats">
                    {/* Channel icons */}
                    {channels.length > 0 && (
                      <>
                        <div className="agent-card-pixel__stat-title">渠道</div>
                        <div className="agent-card-pixel__channels">
                          {channels.map((ch) => {
                            const iconSrc = CHANNEL_ICON_MAP[ch];
                            return iconSrc ? (
                              <img
                                key={ch}
                                className="agent-card-pixel__channel-icon"
                                src={iconSrc}
                                alt={ch}
                                title={ch}
                              />
                            ) : (
                              <span key={ch} className="agent-card-pixel__channel-text" title={ch}>
                                {ch}
                              </span>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <AgentEditDialog
        open={editingAgent !== null || creating}
        agent={editingAgent}
        createMode={creating}
        existingIds={agents.map((a) => a.id)}
        onClose={() => {
          setEditingAgent(null);
          setCreating(false);
        }}
      />
    </div>
  );
}
