/**
 * AgentAnimal.tsx — 牛马档案的形象头像（静止）
 * 形象不再移动/奔跑：是否在工作由外层头像环颜色与呼吸灯表达。
 * 动物形象来自 agent.identity.emoji 选定的物种色板（lib/animals.ts）。
 */
import React from "react";
import { resolveAgentAppearance } from "../../lib/animals.ts";
import { AgentAppearance } from "./AgentAppearance.tsx";

export type AgentAnimalProps = {
  state: "processing" | "waiting" | "idle";
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
  /** 用于色板回退的稳定索引 */
  idx: number;
  size?: number;
};

export function AgentAnimal({
  state,
  emoji,
  avatar,
  avatarUrl,
  idx,
  size = 156,
}: AgentAnimalProps) {
  const appearance = resolveAgentAppearance({ emoji, avatar, avatarUrl }, idx);
  return (
    // 档案中的形象保持完全静止（是否在工作由头像环颜色表达），不加位移动画
    <div
      className={`agent-animal agent-animal--${state === "processing" ? "running" : "rest"} agent-animal--static`}
      style={{ width: size, height: size }}
      title={state === "processing" ? "执行任务中" : "休息中"}
    >
      <AgentAppearance {...appearance} className="ranch-animal__sprite" />
    </div>
  );
}
