import React, { useCallback, useMemo } from "react";
import { AccessCard } from "../components/overview/AccessCard.tsx";
import { AgentsCard } from "../components/overview/AgentsCard.tsx";
import { OrchestrationCard } from "../components/overview/OrchestrationCard.tsx";
import { RanchScene } from "../components/overview/RanchScene.tsx";
// Pure React overview components
import { SnapshotCard, OverviewIcons } from "../components/overview/SnapshotCard.tsx";
import { SwapyLayout, getSavedCardOrder } from "../components/overview/SwapyLayout.tsx";
import { UsageChartCard } from "../components/overview/UsageChartCard.tsx";
import { loadOverview } from "../lib/app-settings.ts";
import type {
  SessionActivityResult,
  GatewayAgentRow,
  CostUsageSummary,
  SessionsUsageResult,
  ChannelsStatusSnapshot,
} from "../lib/types.ts";
import { useAppStore, getReactiveState } from "../store/appStore.ts";

// ─── Token Stats Row ─────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

function TokenStatsRow({ todayTokens, allTokens }: { todayTokens: number; allTokens: number }) {
  if (todayTokens <= 0 && allTokens <= 0) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div className="card" style={{ padding: "16px 20px" }}>
        <div
          className="muted"
          style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {OverviewIcons.wheat(13)} 今日消耗草料（Tokens）
        </div>
        <div
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--text-strong)",
            lineHeight: 1.1,
          }}
        >
          {fmtTokens(todayTokens)}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          {todayTokens.toLocaleString()} 棵草
        </div>
      </div>
      <div className="card" style={{ padding: "16px 20px" }}>
        <div
          className="muted"
          style={{
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {OverviewIcons.fire(13)} 累计消耗草料（Tokens）
        </div>
        <div
          style={{
            fontFamily: "var(--mono, monospace)",
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--text-strong)",
            lineHeight: 1.1,
          }}
        >
          {fmtTokens(allTokens)}
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          {allTokens.toLocaleString()} 棵草
        </div>
      </div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────

// [merge] gateways 已并入 access（牧场大门 · 网关连接）
const DEFAULT_CARD_ORDER = ["usage", "access", "agents"];

export function OverviewView() {
  const s = useAppStore;
  const connected = s((st) => st.connected);
  const hello = s((st) => st.hello);
  const settings = s((st) => st.settings);
  const password = s((st) => st.password);
  const lastError = s((st) => st.lastError);
  const lastErrorCode = s((st) => st.lastErrorCode);
  const reconnect = useCallback(() => {
    void import("../lib/app-gateway.ts").then(({ connectGateway }) => {
      connectGateway(useAppStore.getState() as never);
    });
  }, []);
  const cronStatus = s((st) => st.cronStatus);
  const presenceEntries = s((st) => st.presenceEntries);
  const sessionsResult = s((st) => st.sessionsResult);
  const sessionActivity = s((st) => st.sessionActivity);
  const agentsList = s((st) => st.agentsList);
  const overviewCostDaily = s((st) => st.overviewCostDaily);
  const overviewUsageResult = s((st) => st.overviewUsageResult);
  const overviewWeekUsageResult = s((st) => st.overviewWeekUsageResult);
  const applySettings = s((st) => st.applySettings);
  const set = s((st) => st.set);

  // [version-adapt] presence 是网关/浏览器实例（每个标签页都算），不是牛马。
  // 在线牛马 = 有 running 会话的 agent 数；正在接客 = running 会话数。
  const allSessions = (sessionsResult?.sessions ?? []) as Array<{
    key: string;
    agentId?: string;
    status?: string;
  }>;
  const runningSessions = allSessions.filter((x) => x.status === "running");
  const presenceCount = new Set(runningSessions.map((x) => x.agentId ?? x.key.split(":")[1] ?? ""))
    .size;
  const sessionsCount = runningSessions.length;
  const agents = (agentsList?.agents ?? []) as unknown as GatewayAgentRow[];
  const configForm = s((st) => st.configForm) as Record<string, unknown> | null;
  const channelsSnapshot = s((st) => st.channelsSnapshot) as ChannelsStatusSnapshot | null;

  // [ranch-fix] 网关 2026.9.x 无 sessions.activity RPC（恒 null → 牧场永远摸鱼中）。
  // 用 sessions.list 派生等价的 activity 数据，供 RanchScene2D/3D 与 OrchestrationCard 使用。
  const derivedActivity = React.useMemo<SessionActivityResult | null>(() => {
    if (!sessionsResult) return null;
    const rows = allSessions.map((x) => {
      const row = x as {
        agentId?: string;
        status?: string;
        state?: string;
        lastActivityAgo?: number;
        queueDepth?: number;
        updatedAt?: number | null;
        totalTokens?: number;
        contextTokens?: number;
      };
      const running = row.status === "running";
      const lastAgo =
        typeof row.lastActivityAgo === "number"
          ? row.lastActivityAgo
          : row.updatedAt
            ? Math.max(0, Date.now() - row.updatedAt)
            : 999999;
      return {
        key: row.agentId ? `agent:${row.agentId}:main` : x.key,
        state: (running ? "processing" : "idle") as "processing" | "idle",
        lastActivityAgo: lastAgo,
        queueDepth: row.queueDepth ?? 0,
        totalTokens: row.totalTokens ?? undefined,
        contextTokens: row.contextTokens ?? undefined,
      };
    });
    return {
      ts: Date.now(),
      processing: rows.filter((r) => r.state === "processing").length,
      waiting: 0,
      idle: rows.filter((r) => r.state !== "processing").length,
      sessions: rows,
    };
  }, [sessionsResult, allSessions]);
  const ranchActivity = (sessionActivity as SessionActivityResult | null) ?? derivedActivity;

  // Calcular qué canales están vinculados a cada agent
  const channelBindings = useMemo(() => {
    const map: Record<string, string[]> = {};
    // Fuente 1: routing.bindings
    const routing = (configForm?.routing ?? {}) as Record<string, unknown>;
    const bindings = routing.bindings;
    if (Array.isArray(bindings)) {
      for (const b of bindings) {
        if (b && typeof b === "object" && "agentId" in b && "match" in b) {
          const binding = b as { agentId?: string; match?: { channel?: string } };
          const aid = binding.agentId?.toLowerCase();
          const ch = binding.match?.channel;
          if (aid && ch) {
            (map[aid] ??= []).push(ch);
          }
        }
      }
    }
    // Fuente 2: channelAccounts
    if (channelsSnapshot?.channelAccounts) {
      for (const [channelId, accounts] of Object.entries(channelsSnapshot.channelAccounts)) {
        if (!Array.isArray(accounts)) continue;
        for (const acct of accounts) {
          const aid = acct.accountId?.toLowerCase();
          if (aid && !map[aid]?.includes(channelId)) {
            (map[aid] ??= []).push(channelId);
          }
        }
      }
    }
    // Deduplicar
    for (const k of Object.keys(map)) {
      map[k] = [...new Set(map[k])];
    }
    return map;
  }, [configForm, channelsSnapshot]);

  const snapshot = hello?.snapshot as { authMode?: string } | undefined;
  const isTrustedProxy = snapshot?.authMode === "trusted-proxy";

  const todayTokens =
    (overviewUsageResult as SessionsUsageResult | null)?.sessions?.reduce(
      (sum, s) => sum + (s.usage?.totalTokens ?? 0),
      0,
    ) ?? 0;
  const allTokens = (overviewCostDaily as CostUsageSummary | null)?.totals?.totalTokens ?? 0;

  const cardOrder = useMemo(() => {
    // [merge] gateways 卡片已合并进 access（牧场大门），旧的自定义顺序里去掉它
    const saved = getSavedCardOrder(DEFAULT_CARD_ORDER).filter((x) => x !== "gateways");
    return saved;
  }, []);

  const cardMap: Record<string, React.ReactNode> = {
    usage: (
      <UsageChartCard
        key="usage"
        costDaily={overviewCostDaily as CostUsageSummary | null}
        usageResult={overviewUsageResult as SessionsUsageResult | null}
        weekUsageResult={overviewWeekUsageResult as SessionsUsageResult | null}
      />
    ),
    access: (
      <AccessCard
        key="access"
        settings={settings}
        password={password}
        isTrustedProxy={isTrustedProxy}
        connected={connected}
        helloVersion={hello?.server?.version ?? null}
        onSettingsChange={(next) => applySettings(next)}
        onPasswordChange={(next) => set({ password: next })}
        onSessionKeyChange={(next) => {
          set({ sessionKey: next, chatMessage: "" });
          applySettings({ ...settings, sessionKey: next, lastActiveSessionKey: next });
        }}
        onConnect={() => {}}
        onRefresh={() => void loadOverview(getReactiveState() as never)}
        onReconnect={() => reconnect()}
      />
    ),
    agents: (
      <AgentsCard
        key="agents"
        agents={agents}
        sessions={allSessions}
        channelBindings={channelBindings}
      />
    ),
  };

  return (
    <SwapyLayout>
      <div className="ov-ranch-snapshot-row">
        <div className="ov-ranch-col">
          <RanchScene agents={agents} sessionActivity={ranchActivity} />
        </div>
        <div className="ov-snapshot-col">
          <SnapshotCard
            connected={connected}
            hello={hello}
            lastError={lastError}
            lastErrorCode={lastErrorCode}
            presenceCount={presenceCount}
            sessionsCount={sessionsCount}
            cronJobsCount={cronStatus?.jobs ?? null}
            gatewayUrl={settings.gatewayUrl}
            hasToken={Boolean(settings.token.trim())}
            hasPassword={Boolean(password.trim())}
          />
          <TokenStatsRow todayTokens={todayTokens} allTokens={allTokens} />
        </div>
      </div>
      <div className="overview-swapy">{cardOrder.map((slot) => cardMap[slot])}</div>
      <OrchestrationCard sessionActivity={ranchActivity} />
    </SwapyLayout>
  );
}
