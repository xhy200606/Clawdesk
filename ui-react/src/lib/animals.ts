/**
 * animals.ts — 牛马动物形象共享定义
 * species: agent.identity.emoji 选定的动物形象；未设置时按 agent 顺序取默认色板。
 * 被 RanchScene2D（牧场 2D）与 AgentsCard / AgentAnimal（牛马档案头像）共用。
 */

export type AnimalSpecies = {
  emoji: string;
  label: string;
  body: string;
  spot: string;
};

export const ANIMAL_SPECIES: AnimalSpecies[] = [
  { emoji: "🐄", label: "奶牛", body: "#f5f5f0", spot: "#4a4a4a" },
  { emoji: "🐂", label: "黄牛", body: "#8B7355", spot: "#F5DEB3" },
  { emoji: "🐴", label: "骏马", body: "#d4915c", spot: "#fff8e7" },
  { emoji: "🐑", label: "绵羊", body: "#e8d5b7", spot: "#8B6914" },
  { emoji: "🐐", label: "山羊", body: "#c9b8a3", spot: "#5c4033" },
  { emoji: "🐖", label: "猪猪", body: "#f0b8c4", spot: "#fff" },
  { emoji: "🐕", label: "旺财", body: "#d9a066", spot: "#fff8e7" },
  { emoji: "🐈", label: "狸花", body: "#9a8878", spot: "#e8d5b7" },
  { emoji: "🦙", label: "羊驼", body: "#e0d0b8", spot: "#fff" },
  { emoji: "🦌", label: "小鹿", body: "#c89058", spot: "#fff8e7" },
];

/** 兜底色板（与 RanchScene2D 的 PALETTES 一致顺序） */
export const FALLBACK_PALETTES: Array<{ body: string; spot: string }> = [
  { body: "#f5f5f0", spot: "#4a4a4a" },
  { body: "#d4915c", spot: "#fff8e7" },
  { body: "#8B7355", spot: "#F5DEB3" },
  { body: "#e8d5b7", spot: "#8B6914" },
  { body: "#c9b8a3", spot: "#5c4033" },
  { body: "#888", spot: "#ccc" },
  { body: "#f0e68c", spot: "#cd853f" },
  { body: "#bc8f8f", spot: "#800000" },
];

export type AgentSpeciesInfo = { emoji?: string; label: string; body: string; spot: string };

/** 根据 agent 的 identity.emoji 解析动物形象；未匹配时按索引回退 */
export function resolveAgentSpecies(emoji: string | undefined, idx: number): AgentSpeciesInfo {
  if (emoji) {
    const hit = ANIMAL_SPECIES.find((sp) => sp.emoji === emoji);
    if (hit) return hit;
  }
  const pal = FALLBACK_PALETTES[idx % FALLBACK_PALETTES.length];
  return { label: "牛马", body: pal.body, spot: pal.spot };
}
