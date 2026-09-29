import type { AgentEventPayload } from "./app-tool-stream.ts";

export type AgentRunTrace = {
  runId: string;
  sessionKey?: string;
  startedAt: number;
  endedAt?: number;
  status: "running" | "completed" | "failed";
  provider?: string;
  model?: string;
};

const MAX_RUN_TRACES = 100;

/** Keep only lifecycle metadata; prompts, tool inputs, and raw errors stay out of the UI trace store. */
export function applyAgentRunEvent(
  traces: AgentRunTrace[],
  event?: AgentEventPayload,
): AgentRunTrace[] {
  if (!event?.runId || event.stream !== "lifecycle") return traces;
  const phase = event.data?.phase;
  if (phase !== "start" && phase !== "end" && phase !== "error") return traces;
  const previous = traces.find((trace) => trace.runId === event.runId);
  const timestamp = Number.isFinite(event.ts) ? event.ts : Date.now();
  const provider =
    typeof event.data.provider === "string" ? event.data.provider : previous?.provider;
  const model = typeof event.data.model === "string" ? event.data.model : previous?.model;
  const next: AgentRunTrace = {
    runId: event.runId,
    sessionKey: event.sessionKey ?? previous?.sessionKey,
    startedAt: previous?.startedAt ?? timestamp,
    ...(phase === "start" ? {} : { endedAt: timestamp }),
    status: phase === "start" ? "running" : phase === "error" ? "failed" : "completed",
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
  return [next, ...traces.filter((trace) => trace.runId !== next.runId)].slice(0, MAX_RUN_TRACES);
}
