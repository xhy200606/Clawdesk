/**
 * AgentAnimal.tsx — 牛马档案的状态动画头像
 * running（有 running 会话）→ 奔跑动画；idle → 趴卧休息（呼吸）动画。
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
    <div
      className={`agent-animal agent-animal--${state === "processing" ? "running" : "rest"}`}
      style={{ width: size, height: size }}
      title={state === "processing" ? "奔跑中" : "休息中"}
    >
      {/* 奔跑时的速度线 */}
      {state === "processing" && <span className="agent-animal__speed agent-animal__speed--1" />}
      {state === "processing" && <span className="agent-animal__speed agent-animal__speed--2" />}
      <AgentAppearance {...appearance} className="ranch-animal__sprite" />
    </div>
  );
}
