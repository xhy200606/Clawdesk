import React, { useEffect, useRef, useState } from "react";

// ─── Types ───────────────────────────────────────────────────

export interface ContextUsageProps {
  /** 会话已使用的 tokens（sessions.list → totalTokens） */
  usedTokens?: number | null;
  /** 模型上下文窗口（sessions.list → contextTokens） */
  contextTokens?: number | null;
  /** 当前模型 id（用于面板底部展示） */
  modelId?: string | null;
  /** true = 用量由前端估算（提供商未回报 usage） */
  estimated?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

function gaugeColor(percent: number): string {
  if (percent >= 0.9) return "#ef4444";
  if (percent >= 0.7) return "#f59e0b";
  return "#8b93a3";
}

// ─── SVG Progress Ring ───────────────────────────────────────

const RADIUS = 10;
const VIEWBOX = 24;
const CENTER = 12;
const STROKE_WIDTH = 2.4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ProgressRing({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 1);
  const dashOffset = CIRCUMFERENCE * (1 - clamped);
  const color = gaugeColor(clamped);

  return (
    <svg aria-hidden="true" height="18" viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`} width="18">
      <circle
        cx={CENTER}
        cy={CENTER}
        fill="none"
        opacity="0.22"
        r={RADIUS}
        stroke="currentColor"
        strokeWidth={STROKE_WIDTH}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        fill="none"
        r={RADIUS}
        stroke={color}
        strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={STROKE_WIDTH}
        style={{
          transform: "rotate(-90deg)",
          transformOrigin: "center",
          transition: "stroke-dashoffset 300ms ease",
        }}
      />
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────

export function ContextUsage({ usedTokens, contextTokens, modelId, estimated }: ContextUsageProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const windowTokens = contextTokens ?? 0;
  const used = Math.max(usedTokens ?? 0, 0);

  // 点击外部/Escape 关闭面板
  useEffect(() => {
    if (!panelOpen) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanelOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick, true);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [panelOpen]);

  // 拿不到窗口大小就不展示（避免无意义的百分比）。
  // 注意：必须放在所有 hooks 之后，否则 hooks 数量在两次渲染间变化（React #310）。
  if (!windowTokens) {
    return null;
  }

  const percent = used / windowTokens;
  const clamped = Math.min(percent, 1);
  const pctText = `${(clamped * 100).toFixed(1)}%`;
  const tipText = `${pctText} · ${formatTokenCount(used)} / ${formatTokenCount(windowTokens)} 上下文已使用`;

  const remaining = Math.max(windowTokens - used, 0);
  const rows: Array<{ label: string; tokens: number; color: string }> = [
    { label: "对话消息", tokens: used, color: "#f59e0b" },
    { label: "剩余可用", tokens: remaining, color: "#4c8dff" },
  ];

  return (
    <div
      className="context-usage"
      ref={containerRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="context-usage__trigger"
        title="上下文用量"
        onClick={() => setPanelOpen((v) => !v)}
      >
        <ProgressRing percent={clamped} />
      </button>

      {hovered && !panelOpen && (
        <div className="context-usage__tip" role="tooltip">
          {tipText}
        </div>
      )}

      {panelOpen && (
        <div className="context-usage__card">
          <div className="context-usage__title">
            <span>上下文用量</span>
            <button
              type="button"
              className="context-usage__close"
              aria-label="关闭"
              onClick={() => setPanelOpen(false)}
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="context-usage__hero">
            <span className="context-usage__pct">{pctText}</span>
            <span className="context-usage__used">
              {estimated ? "已使用 ≈" : "已使用 "}
              {formatTokenCount(used)} / {formatTokenCount(windowTokens)}
              {estimated ? "（估算）" : ""}
            </span>
          </div>
          <div className="context-usage__bar">
            <div
              className="context-usage__bar-fill"
              style={{ width: `${clamped * 100}%`, background: gaugeColor(clamped) }}
            />
          </div>
          <div className="context-usage__rows">
            {rows.map((row) => (
              <div key={row.label} className="context-usage__row">
                <span className="context-usage__row-label">
                  <i className="context-usage__dot" style={{ background: row.color }} />
                  {row.label}
                </span>
                <span className="context-usage__row-value">
                  {windowTokens > 0 ? `${((row.tokens / windowTokens) * 100).toFixed(1)}%` : "0%"}
                </span>
              </div>
            ))}
          </div>
          {modelId && (
            <div className="context-usage__footer">
              <span className="context-usage__model">{modelId}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
