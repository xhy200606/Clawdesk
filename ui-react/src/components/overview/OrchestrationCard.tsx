import React, { useMemo, useState } from "react";
import { t } from "../../i18n/index.ts";
import type { AgentRunTrace } from "../../lib/orchestration-traces.ts";
import type {
  SessionActivityResult,
  SessionActivityEntry,
  GatewaySessionRow,
  GatewayAgentRow,
} from "../../lib/types.ts";

// ── Tree Data Structure ────────────────────────────────────────

type TreeNode = {
  key: string;
  label: string;
  session: SessionActivityEntry;
  details?: GatewaySessionRow;
  children: TreeNode[];
  depth: number;
};

type ViewMode = "teams" | "workflow" | "traces";

// ── Layout constants ───────────────────────────────────────────

const NODE_W = 150;
const NODE_H = 60;
const H_GAP = 30;
const V_GAP = 50;

// ── Session key parsing ────────────────────────────────────────

/** 从会话键推断父会话键（网关未返回 parentSessionKey 时的兜底）。 */
function inferParentKey(key: string): string | undefined {
  const m = /^agent:([^:]+):(?:subagent|acp):.+$/.exec(key ?? "");
  return m ? `agent:${m[1]}:main` : undefined;
}

function buildSessionTree(
  sessions: SessionActivityEntry[],
  details: GatewaySessionRow[],
): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const detailsByKey = new Map(details.map((row) => [row.key, row]));

  for (const session of sessions) {
    const { key } = session;
    nodeMap.set(key, {
      key,
      label:
        detailsByKey.get(key)?.label || detailsByKey.get(key)?.displayName || extractLabel(key),
      session,
      details: detailsByKey.get(key),
      children: [],
      depth: 0,
    });
  }

  const childToParent = new Map<string, string>();
  for (const row of details) {
    for (const childKey of row.childSessions ?? []) childToParent.set(childKey, row.key);
  }
  // [hierarchy-fallback] 网关 2026.9.x 的 sessions.list 不返回
  // parentSessionKey / spawnedBy / childSessions，父子关系必须从会话键推断：
  //   agent:<id>:subagent:<uuid>  →  父 agent:<id>:main
  //   agent:<id>:acp:<uuid>       →  父 agent:<id>:main
  for (const node of nodeMap.values()) {
    if (childToParent.has(node.key)) continue;
    const inferred = inferParentKey(node.key);
    if (inferred && inferred !== node.key && nodeMap.has(inferred)) {
      childToParent.set(node.key, inferred);
    }
  }
  const parentOf = new Map<string, string>();
  for (const node of nodeMap.values()) {
    const parentKey =
      node.details?.parentSessionKey ?? node.details?.spawnedBy ?? childToParent.get(node.key);
    if (parentKey && parentKey !== node.key && nodeMap.has(parentKey))
      parentOf.set(node.key, parentKey);
  }
  const roots: TreeNode[] = [];
  for (const node of nodeMap.values()) {
    const parentKey = parentOf.get(node.key);
    const ancestry = new Set([node.key]);
    let ancestor = parentKey;
    while (ancestor && !ancestry.has(ancestor)) {
      ancestry.add(ancestor);
      ancestor = parentOf.get(ancestor);
    }
    if (parentKey && !ancestor) {
      nodeMap.get(parentKey)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const stateOrder: Record<string, number> = { processing: 0, waiting: 1, idle: 2 };
  const sortFn = (a: TreeNode, b: TreeNode) =>
    (stateOrder[a.session.state] ?? 2) - (stateOrder[b.session.state] ?? 2);
  roots.sort(sortFn);
  for (const node of nodeMap.values()) node.children.sort(sortFn);

  const setDepth = (node: TreeNode, depth: number, seen: Set<string>) => {
    if (seen.has(node.key)) return;
    seen.add(node.key);
    node.depth = depth;
    for (const child of node.children) setDepth(child, depth + 1, seen);
  };
  const seen = new Set<string>();
  for (const root of roots) setDepth(root, 0, seen);

  return roots;
}

/**
 * Extraemos etiqueta legible del session key:
 * "agent:dev:web:123"          → "dev (web)"
 * "agent:dev:subagent:abc123"  → "sub:abc12345"
 * "agent:dev:acp:abc123"       → "acp:abc12345"
 */
function extractLabel(key: string): string {
  const parts = key.split(":");

  // Última sección de tipo hijo
  for (let i = parts.length - 2; i >= 0; i--) {
    if (parts[i] === "subagent") {
      const id = parts[i + 1];
      return `sub:${id.length > 8 ? id.slice(0, 8) : id}`;
    }
    if (parts[i] === "acp") {
      const id = parts[i + 1];
      return `acp:${id.length > 8 ? id.slice(0, 8) : id}`;
    }
  }

  // Raíz: "agent:dev:web:123" → "dev (web)"
  if (parts.length >= 2 && parts[0] === "agent") {
    const agentId = parts[1];
    const sessionType = parts.length >= 3 ? parts[2] : "";
    if (sessionType && sessionType !== "main") {
      return `${agentId} (${sessionType})`;
    }
    return agentId;
  }

  return key;
}

function fmtTokens(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n === 0) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function formatWorkflowState(node: TreeNode): string {
  const state = node.details?.subagentRunState || node.details?.status;
  if (state === "done" || state === "completed") return t("orchestration.completed");
  if (state === "error" || state === "failed") return t("orchestration.failed");
  if (state === "aborted") return t("orchestration.aborted");
  if (state === "running") return t("orchestration.running");
  return state || t(`orchestration.${node.session.state}`);
}

function fmtActivityAge(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 60_000) return "<1m";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function fmtDuration(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Layout algorithm ───────────────────────────────────────────

type LayoutNode = {
  node: TreeNode;
  x: number;
  y: number;
  children: LayoutNode[];
};

function layoutTree(roots: TreeNode[]): { nodes: LayoutNode[]; width: number; height: number } {
  if (roots.length === 0) return { nodes: [], width: 0, height: 0 };

  const allLayouts: LayoutNode[] = [];
  let totalWidth = 0;

  for (const root of roots) {
    const layout = layoutSubtree(root, 0);
    // Desplazar horizontalmente
    offsetX(layout, totalWidth);
    allLayouts.push(layout);
    totalWidth += subtreeWidth(root) + H_GAP;
  }

  totalWidth -= H_GAP; // Quitar gap extra
  const height = maxDepth(roots) * (NODE_H + V_GAP) + NODE_H;

  return { nodes: allLayouts, width: totalWidth, height };
}

function layoutSubtree(node: TreeNode, depth: number): LayoutNode {
  if (node.children.length === 0) {
    return { node, x: 0, y: depth * (NODE_H + V_GAP), children: [] };
  }

  const childLayouts: LayoutNode[] = [];
  let childOffset = 0;

  for (const child of node.children) {
    const cl = layoutSubtree(child, depth + 1);
    offsetX(cl, childOffset);
    childLayouts.push(cl);
    childOffset += subtreeWidth(child) + H_GAP;
  }

  // Centrar padre sobre hijos
  const firstChild = childLayouts[0];
  const lastChild = childLayouts[childLayouts.length - 1];
  const parentX = (firstChild.x + lastChild.x) / 2;

  return {
    node,
    x: parentX,
    y: depth * (NODE_H + V_GAP),
    children: childLayouts,
  };
}

function subtreeWidth(node: TreeNode): number {
  if (node.children.length === 0) return NODE_W;
  let w = 0;
  for (const child of node.children) {
    w += subtreeWidth(child) + H_GAP;
  }
  return Math.max(NODE_W, w - H_GAP);
}

function maxDepth(nodes: TreeNode[]): number {
  let d = 0;
  for (const n of nodes) {
    const cd = 1 + (n.children.length > 0 ? maxDepth(n.children) : 0);
    if (cd > d) d = cd;
  }
  return d;
}

function offsetX(layout: LayoutNode, dx: number) {
  layout.x += dx;
  for (const child of layout.children) offsetX(child, dx);
}

// ── SVG Rendering ──────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  processing: "#30d158",
  waiting: "#ff9f0a",
  idle: "#636366",
};

function renderConnections(layout: LayoutNode): React.ReactNode[] {
  const lines: React.ReactNode[] = [];
  const parentCx = layout.x + NODE_W / 2;
  const parentCy = layout.y + NODE_H;

  for (const child of layout.children) {
    const childCx = child.x + NODE_W / 2;
    const childCy = child.y;
    const midY = (parentCy + childCy) / 2;

    lines.push(
      <path
        key={`${layout.node.key}-${child.node.key}`}
        d={`M ${parentCx} ${parentCy} C ${parentCx} ${midY}, ${childCx} ${midY}, ${childCx} ${childCy}`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="2"
        className={`orch-svg__line orch-svg__line--${child.node.session.state}`}
      />,
    );

    // Punta de flecha
    lines.push(
      <circle
        key={`arrow-${layout.node.key}-${child.node.key}`}
        cx={childCx}
        cy={childCy - 1}
        r="3"
        fill="var(--border)"
      />,
    );

    lines.push(...renderConnections(child));
  }

  return lines;
}

function renderNodes(layout: LayoutNode): React.ReactNode[] {
  const { node, x, y } = layout;
  const { session } = node;
  const stateColor = STATE_COLORS[session.state] ?? STATE_COLORS.idle;
  const isProcessing = session.state === "processing";

  const elements: React.ReactNode[] = [];

  // Glow para estado processing
  if (isProcessing) {
    elements.push(
      <rect
        key={`glow-${node.key}`}
        x={x - 2}
        y={y - 2}
        width={NODE_W + 4}
        height={NODE_H + 4}
        rx={10}
        fill="none"
        stroke={stateColor}
        strokeWidth="1"
        opacity={0.3}
        className="orch-svg__glow"
      />,
    );
  }

  // Fondo del nodo
  elements.push(
    <rect
      key={`bg-${node.key}`}
      x={x}
      y={y}
      width={NODE_W}
      height={NODE_H}
      rx={8}
      fill="var(--card)"
      stroke={isProcessing ? stateColor : "var(--border)"}
      strokeWidth={isProcessing ? 1.5 : 1}
      className="orch-svg__node"
    />,
  );

  // Punto de estado
  elements.push(
    <circle
      key={`dot-${node.key}`}
      cx={x + 14}
      cy={y + 15}
      r={4}
      fill={stateColor}
      className={isProcessing ? "orch-svg__dot-pulse" : ""}
    />,
  );

  // Nombre del agent
  elements.push(
    <text
      key={`name-${node.key}`}
      x={x + 24}
      y={y + 18}
      fontSize="12"
      fontWeight="600"
      fill="var(--text-strong)"
      className="orch-svg__text"
    >
      {node.label}
    </text>,
  );

  // Estado + tokens
  elements.push(
    <text
      key={`meta-${node.key}`}
      x={x + 14}
      y={y + 36}
      fontSize="10"
      fill="var(--muted)"
      className="orch-svg__text"
    >
      {t(`orchestration.${session.state}`)} · {fmtTokens(session.totalTokens)} tok
    </text>,
  );

  // Queue badge
  if ((session.queueDepth ?? 0) > 0) {
    elements.push(
      <React.Fragment key={`queue-${node.key}`}>
        <rect
          x={x + NODE_W - 38}
          y={y + 42}
          width={30}
          height={14}
          rx={4}
          fill="rgba(255,159,10,0.15)"
        />
        <text
          x={x + NODE_W - 34}
          y={y + 52}
          fontSize="9"
          fontWeight="600"
          fill="#ff9f0a"
          className="orch-svg__text"
        >
          q:{session.queueDepth}
        </text>
      </React.Fragment>,
    );
  }

  // Renderizar hijos
  for (const child of layout.children) {
    elements.push(...renderNodes(child));
  }

  return elements;
}

// ── Main Card ──────────────────────────────────────────────────

interface OrchestrationCardProps {
  sessionActivity: SessionActivityResult | null;
  sessions?: GatewaySessionRow[];
  traces?: AgentRunTrace[];
  agents?: GatewayAgentRow[];
  onStartTask?: (agentId: string, task: string) => Promise<void>;
  onStopRun?: (sessionKey: string, runId: string) => Promise<void>;
  onOpenSession?: (sessionKey: string) => void;
}

export function OrchestrationCard({
  sessionActivity,
  sessions = [],
  traces = [],
  agents = [],
  onStartTask,
  onStopRun,
  onOpenSession,
}: OrchestrationCardProps) {
  const [view, setView] = useState<ViewMode>("teams");
  const [targetAgentId, setTargetAgentId] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskNotice, setTaskNotice] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [stoppingRunId, setStoppingRunId] = useState("");
  const selectedAgentId = agents.some((agent) => agent.id === targetAgentId)
    ? targetAgentId
    : (agents[0]?.id ?? "");
  const tree = useMemo(() => {
    if (!sessionActivity?.sessions?.length) return [];
    return buildSessionTree(sessionActivity.sessions, sessions);
  }, [sessionActivity, sessions]);

  const layout = useMemo(() => layoutTree(tree), [tree]);

  const stats = sessionActivity
    ? {
        processing: sessionActivity.processing,
        waiting: sessionActivity.waiting,
        idle: sessionActivity.idle,
      }
    : null;

  const flatNodes = useMemo(() => {
    const result: TreeNode[] = [];
    const visit = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        result.push(node);
        visit(node.children);
      }
    };
    visit(tree);
    return result;
  }, [tree]);
  const sessionsByKey = useMemo(
    () => new Map(sessions.map((session) => [session.key, session])),
    [sessions],
  );

  const PADDING = 20;
  const svgW = Math.max(layout.width + PADDING * 2, 300);
  const svgH = layout.height + PADDING * 2;

  return (
    <div className="card orch-card">
      <div className="orch-card__header">
        <div className="orch-card__title">
          <svg
            className="orch-card__icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="5" r="3" />
            <line x1="12" y1="8" x2="12" y2="14" />
            <circle cx="6" cy="19" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="12" y1="14" x2="6" y2="16" />
            <line x1="12" y1="14" x2="18" y2="16" />
          </svg>
          {t("orchestration.title")}
        </div>
        {stats && (
          <div className="orch-card__stats">
            <span className="orch-stat orch-stat--processing">{stats.processing}</span>
            <span className="orch-stat orch-stat--waiting">{stats.waiting}</span>
            <span className="orch-stat orch-stat--idle">{stats.idle}</span>
          </div>
        )}
      </div>
      <div className="orch-card__toolbar" aria-label={t("orchestration.views")}>
        {(["teams", "workflow", "traces"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={view === mode}
            className={`orch-tab${view === mode ? " orch-tab--active" : ""}`}
            onClick={() => setView(mode)}
          >
            {t(`orchestration.${mode}`)}
          </button>
        ))}
        <span className="orch-card__summary">
          {flatNodes.length} {t("orchestration.agents")}
          <span>
            {" "}
            · {fmtTokens(
              flatNodes.reduce((sum, node) => sum + (node.session.totalTokens ?? 0), 0),
            )}{" "}
            tok
          </span>
        </span>
      </div>
      {onStartTask && agents.length > 0 && (
        <form
          className="orch-task-form"
          onSubmit={(event) => {
            event.preventDefault();
            const agentId = selectedAgentId;
            const task = taskDraft.trim();
            if (!agentId || !task || taskSubmitting) return;
            setTaskSubmitting(true);
            setTaskNotice("");
            void onStartTask(agentId, task)
              .then(() => {
                setTaskDraft("");
                setTaskNotice(t("orchestration.taskSubmitted"));
              })
              .catch((error: unknown) => {
                setTaskNotice(error instanceof Error ? error.message : String(error));
              })
              .finally(() => setTaskSubmitting(false));
          }}
        >
          <select
            aria-label={t("orchestration.targetAgent")}
            value={selectedAgentId}
            onChange={(event) => setTargetAgentId(event.target.value)}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name || agent.identity?.name || agent.id}
              </option>
            ))}
          </select>
          <input
            aria-label={t("orchestration.taskPlaceholder")}
            placeholder={t("orchestration.taskPlaceholder")}
            value={taskDraft}
            onChange={(event) => setTaskDraft(event.target.value)}
          />
          <button type="submit" disabled={taskSubmitting || !taskDraft.trim()}>
            {taskSubmitting ? t("orchestration.submitting") : t("orchestration.startTask")}
          </button>
          {taskNotice && (
            <span className="orch-task-form__notice" role="status">
              {taskNotice}
            </span>
          )}
        </form>
      )}
      <div className="orch-card__body">
        {tree.length === 0 && !(view === "traces" && traces.length > 0) ? (
          <div className="orch-card__empty">{t("orchestration.empty")}</div>
        ) : view === "teams" ? (
          <>
            <div className="orch-svg-container">
              <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="orch-svg">
                <g transform={`translate(${PADDING}, ${PADDING})`}>
                  {layout.nodes.map((l) => renderConnections(l))}
                  {layout.nodes.map((l) => renderNodes(l))}
                </g>
              </svg>
            </div>
            {onOpenSession && (
              <div className="orch-session-actions">
                {flatNodes.map((node) => (
                  <button key={node.key} type="button" onClick={() => onOpenSession(node.key)}>
                    {node.label} <span>↗</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : view === "workflow" ? (
          <div className="orch-workflow">
            {flatNodes.map((node) => (
              <div
                className="orch-workflow__step"
                key={node.key}
                style={{ marginLeft: Math.min(node.depth, 5) * 20 }}
              >
                <span
                  className={`orch-workflow__number orch-workflow__number--${node.session.state}`}
                >
                  {node.depth > 0 ? "↳" : "●"}
                </span>
                <div className="orch-workflow__content">
                  <strong>{node.label}</strong>
                  <span>
                    {formatWorkflowState(node)} ·{" "}
                    {node.session.queueDepth > 0
                      ? `${node.session.queueDepth} ${t("orchestration.queued")}`
                      : t("orchestration.ready")}
                  </span>
                </div>
                <code>
                  {node.details?.parentSessionKey ||
                  node.details?.spawnedBy ||
                  node.key.includes(":subagent:")
                    ? t("orchestration.subagent")
                    : t("orchestration.agent")}
                </code>
                {onStopRun &&
                  (node.details?.parentSessionKey ||
                    node.details?.spawnedBy ||
                    node.key.includes(":subagent:")) &&
                  node.details?.hasActiveRun &&
                  node.details.activeRunIds?.[0] && (
                    <button
                      className="orch-workflow__stop"
                      type="button"
                      disabled={stoppingRunId === node.details.activeRunIds[0]}
                      onClick={() => {
                        const runId = node.details?.activeRunIds?.[0];
                        if (!runId) return;
                        setStoppingRunId(runId);
                        void onStopRun(node.key, runId)
                          .then(() => setActionNotice(t("orchestration.stopSubmitted")))
                          .catch((error: unknown) =>
                            setActionNotice(error instanceof Error ? error.message : String(error)),
                          )
                          .finally(() => setStoppingRunId(""));
                      }}
                    >
                      {t("orchestration.stop")}
                    </button>
                  )}
              </div>
            ))}
            {actionNotice && (
              <p role="status" className="orch-traces__note">
                {actionNotice}
              </p>
            )}
          </div>
        ) : (
          <div className="orch-traces">
            {traces.map((trace) => {
              const session = trace.sessionKey ? sessionsByKey.get(trace.sessionKey) : undefined;
              const model = trace.model ?? session?.model;
              const provider = trace.provider ?? session?.modelProvider;
              return (
                <div className="orch-trace" key={trace.runId}>
                  <span
                    className={`orch-trace__dot orch-trace__dot--${trace.status === "running" ? "processing" : trace.status === "failed" ? "waiting" : "idle"}`}
                  />
                  <div className="orch-trace__main">
                    <strong>{session?.label || trace.sessionKey || trace.runId.slice(0, 8)}</strong>
                    <code>{trace.runId}</code>
                  </div>
                  <div className="orch-trace__model">
                    <span>
                      {provider && model
                        ? `${provider} / ${model}`
                        : model || t("orchestration.modelUnknown")}
                    </span>
                    <small>
                      {t(`orchestration.${trace.status}`)} ·{" "}
                      {fmtDuration((trace.endedAt ?? Date.now()) - trace.startedAt)}
                    </small>
                  </div>
                  {onOpenSession && session && (
                    <button
                      className="orch-trace__open"
                      type="button"
                      onClick={() => onOpenSession(session.key)}
                    >
                      {t("orchestration.open")}
                    </button>
                  )}
                </div>
              );
            })}
            {traces.length > 0 && (
              <p className="orch-traces__note">{t("orchestration.runTraceNote")}</p>
            )}
            {flatNodes.length > 0 && (
              <p className="orch-traces__note">{t("orchestration.sessionSnapshot")}</p>
            )}
            {flatNodes.map((node) => (
              <div className="orch-trace" key={node.key}>
                <span className={`orch-trace__dot orch-trace__dot--${node.session.state}`} />
                <div className="orch-trace__main">
                  <strong>{node.label}</strong>
                  <code>{node.key}</code>
                </div>
                <div className="orch-trace__model">
                  <span>
                    {sessionsByKey.get(node.key)?.modelProvider &&
                    sessionsByKey.get(node.key)?.model
                      ? `${sessionsByKey.get(node.key)?.modelProvider} / ${sessionsByKey.get(node.key)?.model}`
                      : node.session.state === "processing"
                        ? t("orchestration.requestActive")
                        : t("orchestration.requestIdle")}
                  </span>
                  <small>
                    {fmtTokens(sessionsByKey.get(node.key)?.inputTokens)} in ·{" "}
                    {fmtTokens(sessionsByKey.get(node.key)?.outputTokens)} out ·{" "}
                    {t("orchestration.context")}: {fmtTokens(node.session.contextTokens)} ·{" "}
                    {fmtActivityAge(node.session.lastActivityAgo)}
                  </small>
                </div>
                {onOpenSession && (
                  <button
                    className="orch-trace__open"
                    type="button"
                    onClick={() => onOpenSession(node.key)}
                  >
                    {t("orchestration.open")}
                  </button>
                )}
              </div>
            ))}
            {flatNodes.length > 0 && (
              <p className="orch-traces__note">{t("orchestration.traceNote")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
