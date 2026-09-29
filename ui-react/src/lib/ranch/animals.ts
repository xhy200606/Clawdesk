/**
 * animals.ts — 牛马动物形象共享定义
 * species: agent.identity.emoji 选定的动物；未设置时按 agent 顺序选默认动物。
 * 档案、2D 和 3D 牧场共用同一物种映射。
 */

export type AnimalSpecies = {
  emoji: string;
  label: string;
  kind:
    | "cow"
    | "horse"
    | "sheep"
    | "goat"
    | "pig"
    | "dog"
    | "cat"
    | "llama"
    | "deer"
    | "chicken"
    | "duck"
    | "rabbit"
    | "squirrel";
  body: string;
  marking: string;
  muzzle: string;
};

export const ANIMAL_SPECIES: AnimalSpecies[] = [
  {
    emoji: "🐄",
    label: "奶牛",
    kind: "cow",
    body: "#f2eee2",
    marking: "#35383b",
    muzzle: "#e8b6a9",
  },
  {
    emoji: "🐂",
    label: "黄牛",
    kind: "cow",
    body: "#ae7045",
    marking: "#70442d",
    muzzle: "#d6a580",
  },
  {
    emoji: "🐴",
    label: "骏马",
    kind: "horse",
    body: "#ad7047",
    marking: "#432b25",
    muzzle: "#d6ad8a",
  },
  {
    emoji: "🐑",
    label: "绵羊",
    kind: "sheep",
    body: "#f4eee1",
    marking: "#d7c7b2",
    muzzle: "#aa8e7c",
  },
  {
    emoji: "🐐",
    label: "山羊",
    kind: "goat",
    body: "#e7d6b4",
    marking: "#846f5e",
    muzzle: "#c7a795",
  },
  {
    emoji: "🐖",
    label: "猪猪",
    kind: "pig",
    body: "#eca7a8",
    marking: "#d97986",
    muzzle: "#f5bbbd",
  },
  {
    emoji: "🐕",
    label: "旺财",
    kind: "dog",
    body: "#c79258",
    marking: "#6b4739",
    muzzle: "#e2bd8e",
  },
  {
    emoji: "🐈",
    label: "狸花",
    kind: "cat",
    body: "#b79d7d",
    marking: "#61584f",
    muzzle: "#d8c6aa",
  },
  {
    emoji: "🦙",
    label: "羊驼",
    kind: "llama",
    body: "#e5c9a7",
    marking: "#aa8c70",
    muzzle: "#d9bca5",
  },
  {
    emoji: "🦌",
    label: "小鹿",
    kind: "deer",
    body: "#b88054",
    marking: "#f1d6b0",
    muzzle: "#dfbb9b",
  },
  {
    emoji: "🐔",
    label: "小鸡",
    kind: "chicken",
    body: "#f6f2e8",
    marking: "#e0b13c",
    muzzle: "#e8967c",
  },
  {
    emoji: "🦆",
    label: "鸭子",
    kind: "duck",
    body: "#f3f0e6",
    marking: "#c8a24a",
    muzzle: "#e8b83c",
  },
  {
    emoji: "🐰",
    label: "兔子",
    kind: "rabbit",
    body: "#f5f1ea",
    marking: "#dcd2c6",
    muzzle: "#f0c9c0",
  },
  {
    emoji: "🐿️",
    label: "松鼠",
    kind: "squirrel",
    body: "#c98a52",
    marking: "#8a5a34",
    muzzle: "#e6c19a",
  },
];

/** 根据 agent 的 identity.emoji 解析动物形象；未匹配时按索引回退 */
export function resolveAgentSpecies(emoji: string | undefined, idx: number): AnimalSpecies {
  if (emoji) {
    const hit = ANIMAL_SPECIES.find((sp) => sp.emoji === emoji);
    if (hit) return hit;
  }
  return ANIMAL_SPECIES[idx % ANIMAL_SPECIES.length];
}

/** The same saved appearance is used by the profile and both ranch views. */
export function resolveAgentAppearance(
  identity: { emoji?: string; avatar?: string; avatarUrl?: string } | undefined,
  idx: number,
) {
  const species = resolveAgentSpecies(identity?.emoji, idx);
  if (ANIMAL_SPECIES.some((animal) => animal.emoji === identity?.avatar?.trim())) {
    return { emoji: species.emoji, image: null };
  }
  const avatar = identity?.avatarUrl?.trim() || identity?.avatar?.trim() || "";
  const image = /^(https?:\/\/|data:image\/|\/)/i.test(avatar) ? avatar : null;
  return { emoji: species.emoji, image };
}
