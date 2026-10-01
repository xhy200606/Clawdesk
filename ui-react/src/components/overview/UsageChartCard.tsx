import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  CostUsageSummary,
  SessionsUsageResult,
  SessionUsageTimeSeries,
} from "../../lib/types/types.ts";
import { getReactiveState, useAppStore } from "../../store/appStore.ts";
import { DragHandle } from "./AccessCard.tsx";

// ─── Helpers ─────────────────────────────────────────────────

type ChartMode = "1d" | "7d" | "ctx";
type CtxRange = "1d" | "7d";
const CTP = 4; // chars-per-token estimate

function fmtT(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function formatTick(val: number | string): string {
  const n = typeof val === "string" ? Number(val) : val;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(n);
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type UsagePoint = { key: string; agentId: string; timestamp: number; tokens: number };

// ─── Chart.js instance management ────────────────────────────

let _usageChartInstance: import("chart.js").Chart | null = null;
let _usageChartCanvas: HTMLCanvasElement | null = null;
let _ctxChartInstance: import("chart.js").Chart | null = null;
let _ctxChartCanvas: HTMLCanvasElement | null = null;

async function initOrUpdateUsageChart(
  canvas: HTMLCanvasElement,
  labels: string[],
  data: number[],
  mode: "1d" | "7d",
) {
  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);
  const isDark = document.documentElement.dataset.theme === "dark";
  const textColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  if (_usageChartInstance && _usageChartCanvas !== canvas) {
    _usageChartInstance.destroy();
    _usageChartInstance = null;
    _usageChartCanvas = null;
  }

  if (_usageChartInstance) {
    _usageChartInstance.data.labels = labels;
    _usageChartInstance.data.datasets[0].data = data;
    const xA = _usageChartInstance.options.scales?.x as Record<string, unknown> | undefined;
    const yA = _usageChartInstance.options.scales?.y as Record<string, unknown> | undefined;
    if (xA && "ticks" in xA) {
      (xA.ticks as Record<string, unknown>).color = textColor;
      (xA as Record<string, unknown>).maxTicksLimit = mode === "1d" ? 8 : undefined;
    }
    if (yA && "ticks" in yA) {
      (yA.ticks as Record<string, unknown>).color = textColor;
      (yA as Record<string, unknown>).grid = { color: gridColor };
    }
    const tt = _usageChartInstance.options.plugins?.tooltip;
    if (tt)
      Object.assign(tt, {
        backgroundColor: isDark ? "rgba(20,20,40,0.95)" : "rgba(255,255,255,0.95)",
        titleColor: isDark ? "#fff" : "#333",
        bodyColor: isDark ? "rgba(255,255,255,0.8)" : "#555",
        borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
      });
    (_usageChartInstance.data.datasets[0] as unknown as Record<string, unknown>).pointBorderColor =
      isDark ? "#1a1a2e" : "#fff";
    _usageChartInstance.update("none");
    return;
  }

  _usageChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: "#818cf8",
          backgroundColor: (ctx) => {
            const { ctx: c, chartArea } = ctx.chart;
            if (!chartArea) return "rgba(129,140,248,0.1)";
            const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            grad.addColorStop(0, "rgba(129,140,248,0.35)");
            grad.addColorStop(1, "rgba(129,140,248,0.02)");
            return grad;
          },
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: "#818cf8",
          pointBorderColor: isDark ? "#1a1a2e" : "#fff",
          pointBorderWidth: 1.5,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "rgba(20,20,40,0.95)" : "rgba(255,255,255,0.95)",
          titleColor: isDark ? "#fff" : "#333",
          bodyColor: isDark ? "rgba(255,255,255,0.8)" : "#555",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          displayColors: false,
          callbacks: { label: (ctx) => `${(ctx.parsed.y ?? 0).toLocaleString()} tokens` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: textColor,
            font: { size: 11 },
            maxTicksLimit: mode === "1d" ? 8 : undefined,
          },
          border: { display: false },
        },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: (val) => formatTick(val),
            maxTicksLimit: 5,
          },
          border: { display: false },
          beginAtZero: true,
        },
      },
    },
  });
  _usageChartCanvas = canvas;
}

async function initOrUpdateCtxChart(
  canvas: HTMLCanvasElement,
  rows: Array<{ label: string; tokens: number; color: string }>,
  sessionCount: number,
) {
  const { Chart, registerables } = await import("chart.js");
  Chart.register(...registerables);
  const isDark = document.documentElement.dataset.theme === "dark";
  const textColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const labels = rows.map((r) => r.label);
  const data = rows.map((r) => r.tokens);
  const colors = rows.map((r) => r.color);

  if (_ctxChartInstance && _ctxChartCanvas !== canvas) {
    _ctxChartInstance.destroy();
    _ctxChartInstance = null;
    _ctxChartCanvas = null;
  }
  if (_ctxChartInstance) {
    _ctxChartInstance.data.labels = labels;
    _ctxChartInstance.data.datasets[0].data = data;
    _ctxChartInstance.data.datasets[0].backgroundColor = colors;
    _ctxChartInstance.update("none");
    return;
  }

  _ctxChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderRadius: 4, barThickness: 24 }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? "rgba(20,20,40,0.95)" : "rgba(255,255,255,0.95)",
          titleColor: isDark ? "#fff" : "#333",
          bodyColor: isDark ? "rgba(255,255,255,0.8)" : "#555",
          borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          displayColors: true,
          callbacks: {
            label: (ctx) => {
              const total = (ctx.dataset.data as number[]).reduce((a, b) => a + (b ?? 0), 0);
              const val = ctx.parsed.x ?? 0;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0";
              return `${formatTick(val)} tokens (${pct}%)`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 11 }, callback: (val) => formatTick(val) },
          border: { display: false },
          beginAtZero: true,
          title:
            sessionCount > 1
              ? {
                  display: true,
                  text: `avg ${sessionCount} sessions`,
                  color: textColor,
                  font: { size: 10 },
                }
              : undefined,
        },
        y: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 12, weight: "bold" } },
          border: { display: false },
        },
      },
    },
  });
  _ctxChartCanvas = canvas;
}

// ─── Agent Filter Dropdown ───────────────────────────────────

function AgentFilterDropdown({
  agents,
  selected,
  onChange,
}: {
  agents: string[];
  selected: string;
  onChange: (agent: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    requestAnimationFrame(() => document.addEventListener("click", close));
    return () => document.removeEventListener("click", close);
  }, [open]);

  if (agents.length <= 1) return null;

  return (
    <div className="ov-agent-dropdown" ref={ref}>
      <button className="ov-agent-btn" onClick={() => setOpen(!open)}>
        {selected || "全部 Agent"}
        <span className="ov-agent-arrow">▾</span>
      </button>
      {open && (
        <div className="ov-agent-menu open">
          {[{ value: "", label: "全部 Agent" }, ...agents.map((a) => ({ value: a, label: a }))].map(
            (opt) => (
              <div
                key={opt.value}
                className={`ov-agent-option ${opt.value === selected ? "selected" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.value === selected ? "✓ " : ""}
                {opt.label}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export type UsageChartCardProps = {
  costDaily: CostUsageSummary | null;
  usageResult: SessionsUsageResult | null;
  weekUsageResult: SessionsUsageResult | null;
};

export function UsageChartCard({ costDaily, usageResult, weekUsageResult }: UsageChartCardProps) {
  const settings = useAppStore((s) => s.settings);
  // 饲料消耗趋势默认显示 1d；切换 1d/7d 时会自动记住为默认（settings.usageDefaultMode）
  const [mode, setMode] = useState<ChartMode>(settings.usageDefaultMode === "7d" ? "7d" : "1d");
  const [ctxRange, setCtxRange] = useState<CtxRange>("1d");
  const [agentFilter, setAgentFilter] = useState("");
  const [usagePoints, setUsagePoints] = useState<UsagePoint[]>([]);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [pointsNote, setPointsNote] = useState<string | null>(null);
  // 用量快照（updater 采集器落盘，nginx 托管于 /usage-history/）：Map<dateKey, Map<agentId, hours[24]>>
  // 会话被归档/压缩后实时时序就查不到它，只有快照里还留着归档前的逐小时用量。
  const [snapData, setSnapData] = useState<Map<string, Map<string, number[]>> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxCanvasRef = useRef<HTMLCanvasElement>(null);

  const daily = costDaily?.daily ?? [];
  const hasWeekData = daily.length > 0;
  const hasCtxData =
    usageResult?.sessions?.some((s: Record<string, unknown>) => s.contextWeight) ?? false;

  // Collect unique agents
  const agentSet = new Set<string>();
  for (const s of usageResult?.sessions ?? []) {
    if (s.agentId) agentSet.add(s.agentId);
  }
  for (const s of weekUsageResult?.sessions ?? []) {
    if (s.agentId) agentSet.add(s.agentId);
  }
  const agentList = Array.from(agentSet).sort();
  const hasFilter = agentFilter !== "" && agentSet.has(agentFilter);

  // Session totals have no hourly breakdown. Request the gateway's recorded usage points.
  useEffect(() => {
    if (mode !== "1d" && !(mode === "7d" && hasFilter)) return;
    const client = getReactiveState().client;
    const entries =
      mode === "1d" ? (usageResult?.sessions ?? []) : (weekUsageResult?.sessions ?? []);
    if (!client || entries.length === 0) {
      setUsagePoints([]);
      setPointsLoading(false);
      setPointsError(null);
      setPointsNote(null);
      return;
    }
    const selected = hasFilter ? entries.filter((entry) => entry.agentId === agentFilter) : entries;
    const unique = [...new Map(selected.map((entry) => [entry.key, entry])).values()];
    let canceled = false;
    setPointsLoading(true);
    setPointsError(null);
    setPointsNote(null);
    setUsagePoints([]);
    void (async () => {
      const points: UsagePoint[] = [];
      let failures = 0;
      let cursor = 0;
      // transcript 已归档/清理的会话：网关返回 "No transcript found"，
      // 它们本来就没有逐小时记录，视为「无数据」而非失败，今日总量口径同步扣除。
      const noTranscript = new Set<string>();
      const failedKeys = new Set<string>();
      const workers = Array.from({ length: Math.min(6, unique.length) }, async () => {
        while (cursor < unique.length) {
          const entry = unique[cursor++];
          try {
            const series = await client.request<SessionUsageTimeSeries>(
              "sessions.usage.timeseries",
              {
                key: entry.key,
                maxPoints: 100000, // 关闭下采样：保证逐小时分布精确
              },
            );
            for (const point of series?.points ?? []) {
              if (Number.isFinite(point.timestamp) && Number.isFinite(point.totalTokens)) {
                points.push({
                  key: entry.key,
                  agentId: entry.agentId ?? entry.key.split(":")[1] ?? "",
                  timestamp: point.timestamp,
                  tokens: point.totalTokens,
                });
              }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/no transcript found/i.test(msg)) noTranscript.add(entry.key);
            else {
              failures++;
              failedKeys.add(entry.key);
            }
          }
        }
      });
      await Promise.all(workers);
      if (canceled) return;
      // 按会话逐一核对：transcript 时序（实时）与 sessions.usage 汇总（缓存，可能滞后）
      // 天然存在时间差，不能全局硬比；只按会话找真正缺明细的部分，图表照常绘制。
      const todayKey = localDateKey(new Date());
      const todayTokensByKey = new Map<string, number>();
      for (const point of points) {
        if (localDateKey(new Date(point.timestamp)) !== todayKey) continue;
        todayTokensByKey.set(point.key, (todayTokensByKey.get(point.key) ?? 0) + point.tokens);
      }
      let archivedCount = 0;
      let archivedTokens = 0;
      let partialTokens = 0;
      for (const entry of unique) {
        const usage = entry.usage?.totalTokens ?? 0;
        if (noTranscript.has(entry.key)) {
          if (usage > 0) {
            archivedCount++;
            archivedTokens += usage;
          }
          continue;
        }
        if (failedKeys.has(entry.key)) continue;
        const gap = usage - (todayTokensByKey.get(entry.key) ?? 0);
        if (gap > Math.max(1000, usage * 0.1)) partialTokens += gap;
      }
      setUsagePoints(points);
      const notes: string[] = [];
      if (archivedCount > 0)
        notes.push(
          `${archivedCount} 个归档会话（${fmtT(archivedTokens)} tokens）无逐小时记录，未计入下图`,
        );
      if (partialTokens > 0)
        notes.push(`部分会话缺少约 ${fmtT(partialTokens)} tokens 的逐小时明细`);
      setPointsNote(notes.length > 0 ? notes.join("；") : null);
      setPointsError(failures > 0 ? `${failures} 个会话的逐小时用量读取失败` : null);
      setPointsLoading(false);
    })();
    return () => {
      canceled = true;
    };
  }, [mode, hasFilter, agentFilter, usageResult, weekUsageResult]);

  // 拉取用量快照（1d 或 7d+筛选时），失败静默（快照缺失时回退纯实时渲染）
  useEffect(() => {
    if (mode !== "1d" && !(mode === "7d" && hasFilter)) return;
    let canceled = false;
    void (async () => {
      const now = new Date();
      const dates: string[] =
        mode === "1d"
          ? [localDateKey(now)]
          : Array.from({ length: 7 }, (_, i) => {
              const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
              return localDateKey(d);
            });
      const acc = new Map<string, Map<string, number[]>>();
      await Promise.all(
        dates.map(async (dateKey) => {
          try {
            const r = await fetch(
              `/usage-history/${dateKey}.json?t=${Math.floor(Date.now() / 60000)}`,
              {
                cache: "no-store",
              },
            );
            if (!r.ok) return;
            const j = (await r.json()) as {
              sessions?: Record<string, { agent?: string; hours?: unknown }>;
            };
            if (!j?.sessions || typeof j.sessions !== "object") return;
            // 按会话存 max 再按 agent 求和：会话组合变化（归档/压缩）不会少算
            const m = new Map<string, number[]>();
            for (const rec of Object.values(j.sessions)) {
              const hours = rec?.hours;
              if (!Array.isArray(hours) || hours.length !== 24) continue;
              const agentId = rec?.agent || "unknown";
              let arr = m.get(agentId);
              if (!arr) {
                arr = new Array<number>(24).fill(0);
                m.set(agentId, arr);
              }
              for (let h = 0; h < 24; h++) arr[h] += (hours as number[])[h] ?? 0;
            }
            if (m.size > 0) acc.set(dateKey, m);
          } catch {
            /* 快照缺失不影响绘图 */
          }
        }),
      );
      if (!canceled) setSnapData(acc);
    })();
    return () => {
      canceled = true;
    };
  }, [mode, hasFilter]);

  const today = localDateKey(new Date());
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, tokens: 0 }));
  for (const point of usagePoints) {
    const date = new Date(point.timestamp);
    if (localDateKey(date) === today && (!hasFilter || point.agentId === agentFilter)) {
      hourly[date.getHours()].tokens += point.tokens;
    }
  }
  // 快照合并：按小时取 max（用量只增不减），补回归档/压缩会话的逐小时用量
  const snapToday = snapData?.get(today);
  const snapCovered = !!snapToday && snapToday.size > 0;
  if (snapToday) {
    const snapHourly = new Array<number>(24).fill(0);
    for (const [agentId, hours] of snapToday) {
      if (hasFilter && agentId !== agentFilter) continue;
      for (let h = 0; h < 24; h++) snapHourly[h] += hours[h] ?? 0;
    }
    for (let h = 0; h < 24; h++) hourly[h].tokens = Math.max(hourly[h].tokens, snapHourly[h]);
  }
  const hasDayData = hourly.some((hour) => hour.tokens > 0);

  // Compute chart data
  const isChartMode = mode !== "ctx";
  let labels: string[] = [];
  let data: number[] = [];
  let subtitle = "";

  if (mode === "7d" && hasWeekData) {
    if (hasFilter && weekUsageResult) {
      const now = new Date();
      const dayMap = new Map<string, number>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
        dayMap.set(localDateKey(d), 0);
      }
      for (const point of usagePoints) {
        const dateStr = localDateKey(new Date(point.timestamp));
        if (dayMap.has(dateStr)) dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + point.tokens);
      }
      // 快照按日合并（此处 agentFilter 非空）：归档会话的当日用量从快照补回
      if (snapData) {
        for (const [dateKey, agents] of snapData) {
          if (!dayMap.has(dateKey)) continue;
          let sum = 0;
          for (const [agentId, hours] of agents) {
            if (agentId !== agentFilter) continue;
            for (const v of hours) sum += v ?? 0;
          }
          dayMap.set(dateKey, Math.max(dayMap.get(dateKey) ?? 0, sum));
        }
      }
      labels = Array.from(dayMap.keys()).map((d) => {
        const dt = new Date(d + "T00:00:00");
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
      });
      data = Array.from(dayMap.values());
    } else {
      labels = daily.map((d) => {
        const dt = new Date(d.date + "T00:00:00");
        return `${dt.getMonth() + 1}/${dt.getDate()}`;
      });
      data = daily.map((d) => d.totalTokens ?? 0);
    }
    const total = data.reduce((a, b) => a + b, 0);
    subtitle = `最近 ${daily.length} 天 · ${fmtT(total)} tokens`;
  } else if (mode === "1d") {
    labels = hourly.map((h) => `${h.hour}:00`);
    data = hourly.map((h) => h.tokens);
    const total = data.reduce((a, b) => a + b, 0);
    subtitle = `今日（按小时）· ${fmtT(total)} tokens`;
  } else {
    subtitle = ctxRange === "7d" ? "上下文构成（7天）" : "上下文构成（今日）";
  }

  // Compute context breakdown
  let ctxRows: Array<{ label: string; tokens: number; color: string }> = [];
  let ctxSessionCount = 0;
  if (mode === "ctx") {
    let sC = 0,
      kC = 0,
      tC = 0,
      fC = 0,
      cnt = 0;
    const ctxSource =
      ctxRange === "7d" ? (weekUsageResult?.sessions ?? []) : (usageResult?.sessions ?? []);
    const ctxSessions = hasFilter ? ctxSource.filter((s) => s.agentId === agentFilter) : ctxSource;
    for (const s of ctxSessions) {
      const cw = (s as Record<string, unknown>).contextWeight as
        | Record<string, Record<string, number>>
        | undefined;
      if (!cw) continue;
      sC += cw.systemPrompt?.chars ?? 0;
      kC += cw.skills?.promptChars ?? 0;
      tC += (cw.tools?.listChars ?? 0) + (cw.tools?.schemaChars ?? 0);
      const wf = (cw as Record<string, unknown>).injectedWorkspaceFiles as
        | Array<{ injectedChars: number }>
        | undefined;
      fC += (wf ?? []).reduce((a, f) => a + f.injectedChars, 0);
      cnt++;
    }
    if (cnt > 1) {
      sC = Math.round(sC / cnt);
      kC = Math.round(kC / cnt);
      tC = Math.round(tC / cnt);
      fC = Math.round(fC / cnt);
    }
    const sy = Math.round(sC / CTP),
      sk = Math.round(kC / CTP),
      tl = Math.round(tC / CTP),
      fl = Math.round(fC / CTP);
    ctxRows = [
      { label: "System", tokens: sy, color: "#ff4d4d" },
      { label: "Tools", tokens: tl, color: "#ffa64d" },
      { label: "Skills", tokens: sk, color: "#4da6ff" },
      { label: "Files", tokens: fl, color: "#4dff88" },
    ];
    ctxSessionCount = cnt;
  }
  const hasCtxContent = ctxRows.reduce((a, r) => a + r.tokens, 0) > 0;

  // Chart.js rendering
  useEffect(() => {
    if (isChartMode && data.length > 0 && canvasRef.current) {
      void initOrUpdateUsageChart(canvasRef.current, labels, data, mode as "1d" | "7d");
    }
  }, [isChartMode, labels, data, mode]);

  useEffect(() => {
    if (mode === "ctx" && hasCtxContent && ctxCanvasRef.current) {
      void initOrUpdateCtxChart(ctxCanvasRef.current, ctxRows, ctxSessionCount);
    }
  }, [mode, ctxRange, hasCtxContent, ctxRows, ctxSessionCount]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      _usageChartInstance?.destroy();
      _usageChartInstance = null;
      _usageChartCanvas = null;
      _ctxChartInstance?.destroy();
      _ctxChartInstance = null;
      _ctxChartCanvas = null;
    };
  }, []);

  // All hooks MUST be above early returns (React rules of hooks)
  const handleToggle = useCallback((next: ChartMode) => {
    if (_usageChartInstance) {
      _usageChartInstance.destroy();
      _usageChartInstance = null;
    }
    if (_ctxChartInstance) {
      _ctxChartInstance.destroy();
      _ctxChartInstance = null;
    }
    setMode(next);
    // 1d/7d 切换即持久化为默认视图（下次进入默认显示；ctx 视图不记忆）
    if (next === "1d" || next === "7d") {
      const { settings: cur, applySettings: apply } = useAppStore.getState();
      apply({ ...cur, usageDefaultMode: next });
    }
  }, []);

  const handleCtxRange = useCallback((r: CtxRange) => {
    if (_ctxChartInstance) {
      _ctxChartInstance.destroy();
      _ctxChartInstance = null;
    }
    setCtxRange(r);
  }, []);

  const handleAgentChange = useCallback((agent: string) => {
    if (_usageChartInstance) {
      _usageChartInstance.destroy();
      _usageChartInstance = null;
    }
    if (_ctxChartInstance) {
      _ctxChartInstance.destroy();
      _ctxChartInstance = null;
    }
    setAgentFilter(agent);
  }, []);

  if (!hasWeekData && !hasDayData && !hasCtxData && !pointsLoading && !pointsError) {
    return (
      <div data-swapy-slot="usage">
        <div data-swapy-item="usage" />
      </div>
    );
  }
  if (isChartMode && data.length === 0) {
    return (
      <div data-swapy-slot="usage">
        <div data-swapy-item="usage" />
      </div>
    );
  }

  return (
    <div data-swapy-slot="usage">
      <div data-swapy-item="usage">
        <div className="card ov-card--usage">
          <div className="card-header-row">
            <DragHandle />
            <div style={{ flex: 1 }}>
              <div className="card-title">饲料消耗趋势</div>
              <div className="card-sub">{subtitle}</div>
            </div>
            <AgentFilterDropdown
              agents={agentList}
              selected={agentFilter}
              onChange={handleAgentChange}
            />
            <div className="usage-chart-toggle">
              <button
                className={mode === "1d" ? "active" : ""}
                onClick={() => handleToggle("1d")}
                title="今日视图（切换将记住为默认）"
              >
                1d
              </button>
              <button
                className={mode === "7d" ? "active" : ""}
                onClick={() => handleToggle("7d")}
                title="近 7 天视图（切换将记住为默认）"
              >
                7d
              </button>
              <button
                className={mode === "ctx" ? "active" : ""}
                onClick={() => handleToggle("ctx")}
              >
                ctx
              </button>
            </div>
          </div>
          {isChartMode && (mode === "1d" || hasFilter) && pointsLoading ? (
            <div className="muted" style={{ padding: 24, textAlign: "center" }}>
              正在读取真实用量记录…
            </div>
          ) : isChartMode ? (
            <>
              <div
                className="usage-line-chart"
                style={{ marginTop: 12, position: "relative", height: 200 }}
              >
                <canvas ref={canvasRef} />
              </div>
              {(pointsError || pointsNote) && (
                <div
                  className="muted"
                  style={{ marginTop: 6, fontSize: 11, textAlign: "center", opacity: 0.7 }}
                >
                  {pointsError ??
                    (snapCovered ? "已合并用量快照，含归档会话的逐小时用量" : pointsNote)}
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: 12, padding: "0 4px 4px" }}>
              {hasCtxContent ? (
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                    <div className="usage-chart-toggle" style={{ fontSize: 11 }}>
                      <button
                        className={ctxRange === "1d" ? "active" : ""}
                        onClick={() => handleCtxRange("1d")}
                      >
                        1d
                      </button>
                      <button
                        className={ctxRange === "7d" ? "active" : ""}
                        onClick={() => handleCtxRange("7d")}
                      >
                        7d
                      </button>
                    </div>
                  </div>
                  <div style={{ position: "relative", height: 165 }}>
                    <canvas ref={ctxCanvasRef} />
                  </div>
                </>
              ) : (
                <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                  无上下文数据
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
