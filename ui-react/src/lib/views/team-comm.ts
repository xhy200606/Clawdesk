/**
 * Agent 间自动通信聚合（群聊视图）。
 *
 * 协议基础（网关原生能力，无需网关改造）：
 *  - Agent 互发消息走网关内置的 sessions_send 工具（带 inputProvenance 归属，
 *    kind=inter_session），接收会话的 transcript 文本会带上
 *    `[Inter-session message] sourceSession=agent:<id>:...` 前缀；
 *  - 本 hook 轮询各成员主会话的 chat.history，把
 *      · assistant 消息   → 该成员的群聊发言
 *      · inter-session 消息 → 有向消息（from = sourceSession 解析出的成员）
 *      · 普通 user 消息   → 用户指令（灰显）
 *    汇总成一条带方向的时间线，供协作工作台像群聊一样展示。
 *
 * A2A 开关：写入 config 的 tools.agentToAgent.enabled（+ allow）与
 * tools.sessions.visibility，开启后成员 Agent 即可自动互相通信。
 */

import { useEffect, useRef, useState } from "react";

export type CommMessage = {
  id: string;
  /** agentId，或 "user" 表示用户指令 */
  from: string;
  /** agentId，或 "group" 表示面向全体 */
  to: string;
  text: string;
  ts: number;
  /** true = Agent 自动发起的跨会话通信 */
  auto: boolean;
};

type MinimalClient = { request: (method: string, params: unknown) => Promise<unknown> };

type RawHistoryMessage = {
  role?: string;
  content?: unknown;
  timestamp?: number;
  isError?: boolean;
};

const INTER_PREFIX = "[Inter-session message]";

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) =>
        block && typeof block === "object" && (block as { type?: string }).type === "text"
          ? String((block as { text?: string }).text ?? "")
          : "",
      )
      .join("\n");
  }
  return "";
}

/** 解析 inter-session 前缀，返回来源成员与正文 */
function parseInterSession(text: string): { from: string | null; body: string } {
  if (!text.startsWith(INTER_PREFIX)) return { from: null, body: text };
  const lines = text.split("\n");
  const header = lines[0] ?? "";
  const match = /sourceSession=agent:([^:\s]+):/.exec(header);
  const body = lines
    .slice(1)
    .filter((line) => !line.startsWith("This content was routed by OpenClaw"))
    .join("\n")
    .trim();
  return { from: match?.[1] ?? null, body: body || text };
}

function toCommMessages(
  sessionKey: string,
  ownerId: string,
  arr: RawHistoryMessage[],
): CommMessage[] {
  const out: CommMessage[] = [];
  for (const msg of arr) {
    if (msg?.role !== "assistant" && msg?.role !== "user") continue;
    if (msg.isError) continue;
    const raw = extractText(msg.content).trim();
    if (!raw) continue;
    const ts = typeof msg.timestamp === "number" ? msg.timestamp : Date.now();
    const fingerprint = raw.length;
    if (msg.role === "assistant") {
      out.push({
        id: `${sessionKey}:a:${ts}:${fingerprint}`,
        from: ownerId,
        to: "group",
        text: raw,
        ts,
        auto: true,
      });
    } else {
      const { from, body } = parseInterSession(raw);
      if (from) {
        out.push({
          id: `${sessionKey}:i:${ts}:${fingerprint}`,
          from,
          to: ownerId,
          text: body,
          ts,
          auto: true,
        });
      } else {
        out.push({
          id: `${sessionKey}:u:${ts}:${fingerprint}`,
          from: "user",
          to: ownerId,
          text: body,
          ts,
          auto: false,
        });
      }
    }
  }
  return out;
}

/** 轮询各成员主会话，聚合出带方向的群聊时间线 */
export function useTeamGroupChat(
  client: MinimalClient | null | undefined,
  members: Array<{ id: string; sessionKey: string }>,
  intervalMs = 6000,
): { messages: CommMessage[]; refresh: () => void } {
  const [messages, setMessages] = useState<CommMessage[]>([]);
  const [tick, setTick] = useState(0);
  const membersRef = useRef(members);
  membersRef.current = members;

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const poll = async () => {
      const collected: CommMessage[] = [];
      for (const member of membersRef.current) {
        try {
          const res = (await client.request("chat.history", {
            sessionKey: member.sessionKey,
            limit: 40,
          })) as { messages?: RawHistoryMessage[] } | RawHistoryMessage[] | null;
          const arr = Array.isArray(res) ? res : (res?.messages ?? []);
          collected.push(...toCommMessages(member.sessionKey, member.id, arr));
        } catch {
          // 单个会话读取失败不影响整体
        }
      }
      if (!cancelled) {
        collected.sort((a, b) => a.ts - b.ts);
        // 同 id 去重（timestamp 相同的重复轮询）
        const seen = new Set<string>();
        setMessages(collected.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client, tick, intervalMs]);

  return { messages, refresh: () => setTick((t) => t + 1) };
}

// ─── A2A 开关（tools.agentToAgent） ──────────────────────────────

type ConfigSnapshot = { config?: unknown; raw?: unknown; hash?: string };

function parseConfig(snap: ConfigSnapshot): Record<string, unknown> {
  const payload = typeof snap.config === "string" ? snap.config : snap.raw;
  const cfg = typeof payload === "string" ? JSON.parse(payload) : (payload ?? {});
  return cfg as Record<string, unknown>;
}

export async function readA2aEnabled(client: MinimalClient): Promise<boolean> {
  const snap = (await client.request("config.get", {})) as ConfigSnapshot;
  const cfg = parseConfig(snap);
  const tools = cfg.tools as Record<string, unknown> | undefined;
  const a2a = tools?.agentToAgent as { enabled?: boolean } | undefined;
  return Boolean(a2a?.enabled);
}

/** 开启/关闭 Agent 间自动通信（写网关配置；开启时 allow 用通配） */
export async function setA2aEnabled(client: MinimalClient, on: boolean): Promise<void> {
  const snap = (await client.request("config.get", {})) as ConfigSnapshot;
  const cfg = parseConfig(snap) as Record<string, unknown>;
  const tools = { ...((cfg.tools as Record<string, unknown>) ?? {}) };
  const prevA2a = (tools.agentToAgent as Record<string, unknown>) ?? {};
  const a2a: Record<string, unknown> = { ...prevA2a, enabled: on };
  if (on) {
    const allow = Array.isArray(prevA2a.allow) ? prevA2a.allow : [];
    a2a.allow = allow.length > 0 ? allow : ["*"];
  }
  tools.agentToAgent = a2a;
  if (on) {
    tools.sessions = { ...((tools.sessions as Record<string, unknown>) ?? {}), visibility: "all" };
  }
  cfg.tools = tools;
  await client.request("config.set", {
    raw: JSON.stringify(cfg, null, 2),
    baseHash: snap.hash,
  });
}
