// ─── agents 配置条目助手 ─────────────────────────────────────
// 网关 schema（src/config/zod-schema.agents.ts）中 agents 段为 strict 对象：
//   { ownership?, defaults?, entries? }
// entries 是「按 agentId 为键」的 record，条目 = AgentEntrySchema.omit({id}) + { default? }。
// 旧版前端写的 agents.list（数组）会被网关拒绝：Unrecognized key: "list"。
// 所有对单个 agent 的配置写入都必须走 entries 路径。

import {
  updateConfigFormValue,
  removeConfigFormValue,
  type ConfigState,
} from "../controllers/config.ts";

export type AgentConfigEntry = Record<string, unknown>;

/** 读取 config.agents.entries record（浅拷贝，可直接改写后写回） */
export function readAgentConfigEntries(configForm: unknown): Record<string, AgentConfigEntry> {
  const agents = (configForm as { agents?: { entries?: Record<string, AgentConfigEntry> } } | null)
    ?.agents;
  return { ...(agents?.entries ?? {}) };
}

/** agent 条目路径：["agents","entries",agentId,...sub] */
export function agentEntryPath(
  agentId: string,
  ...sub: Array<string | number>
): Array<string | number> {
  return ["agents", "entries", agentId, ...sub];
}

/** 写入 agent 条目子路径（条目不存在时按需创建） */
export function setAgentEntryValue(
  state: ConfigState,
  agentId: string,
  sub: Array<string | number>,
  value: unknown,
) {
  updateConfigFormValue(state as never, agentEntryPath(agentId, ...sub), value);
}

/** 移除 agent 条目子路径 */
export function removeAgentEntryValue(
  state: ConfigState,
  agentId: string,
  sub: Array<string | number>,
) {
  removeConfigFormValue(state as never, agentEntryPath(agentId, ...sub));
}
