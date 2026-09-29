/**
 * 牧场昼夜循环 —— 10 分钟 = 牧场一天（phase 0 = 清晨 06:00）。
 *
 * 2D 场景用它渲染天空渐变 / 太阳月亮 / 星星 / 色调滤镜，
 * 3D 场景用它缩放灯光强度与背景色，两端视觉节奏一致。
 */
import { useEffect, useState } from "react";

export type DayPhaseInfo = {
  /** 0..1，0 = 清晨 06:00，10 分钟走完一圈 */
  phase: number;
  /** 清晨 / 白天 / 黄昏 / 夜晚 */
  label: string;
  isNight: boolean;
  /** 天空渐变（上下两色） */
  skyTop: string;
  skyBottom: string;
  /** 全场景色调滤镜色（multiply 叠加） */
  tint: string;
  /** 日/月位置（视口比例 0..1），showSun 决定画哪个 */
  orbX: number;
  orbY: number;
  showSun: boolean;
  /** 星星整体透明度 0..1 */
  starAlpha: number;
  /** 环境光等级 0.3(夜)~1(昼)，供 3D 灯光缩放 */
  lightLevel: number;
  /** 牧场时钟 hh:mm（06:00 起一天） */
  clock: string;
};

/** 10 分钟一天 */
const CYCLE_MS = 10 * 60 * 1000;

type Key = {
  t: number;
  top: [number, number, number];
  bot: [number, number, number];
  tint: [number, number, number];
  a: number;
  light: number;
};

// 关键帧：清晨 → 白天 → 黄昏 → 夜晚 → 破晓（循环回清晨）
const KEYS: Key[] = [
  { t: 0.0, top: [64, 70, 118], bot: [248, 158, 112], tint: [255, 150, 90], a: 0.16, light: 0.6 },
  { t: 0.1, top: [108, 168, 235], bot: [198, 228, 250], tint: [255, 255, 255], a: 0, light: 1 },
  { t: 0.45, top: [88, 158, 235], bot: [188, 224, 250], tint: [255, 255, 255], a: 0, light: 1 },
  { t: 0.55, top: [126, 92, 142], bot: [250, 162, 92], tint: [255, 128, 64], a: 0.2, light: 0.72 },
  { t: 0.65, top: [14, 20, 46], bot: [32, 44, 84], tint: [12, 18, 48], a: 0.4, light: 0.3 },
  { t: 0.92, top: [14, 20, 46], bot: [32, 44, 84], tint: [12, 18, 48], a: 0.4, light: 0.3 },
  { t: 1.0, top: [64, 70, 118], bot: [248, 158, 112], tint: [255, 150, 90], a: 0.16, light: 0.6 },
];

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const mix = (c1: [number, number, number], c2: [number, number, number], f: number) =>
  [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], f))) as [number, number, number];
const rgb = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function labelOf(phase: number): string {
  if (phase < 0.1) return "清晨";
  if (phase < 0.45) return "白天";
  if (phase < 0.62) return "黄昏";
  return "夜晚";
}

export function useRanchDayCycle(intervalMs = 1000): DayPhaseInfo {
  const [phase, setPhase] = useState(() => (Date.now() % CYCLE_MS) / CYCLE_MS);
  useEffect(() => {
    const id = window.setInterval(() => setPhase((Date.now() % CYCLE_MS) / CYCLE_MS), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  let i = 0;
  while (i < KEYS.length - 2 && phase > KEYS[i + 1].t) i++;
  const k1 = KEYS[i];
  const k2 = KEYS[i + 1];
  const f = Math.min(1, Math.max(0, (phase - k1.t) / (k2.t - k1.t || 1)));

  const top = mix(k1.top, k2.top, f);
  const bot = mix(k1.bot, k2.bot, f);
  const tintC = mix(k1.tint, k2.tint, f);
  const a = lerp(k1.a, k2.a, f);
  const light = lerp(k1.light, k2.light, f);

  // 太阳：phase 0.04→0.56 沿弧线；月亮：0.60→0.98
  const isNight = phase >= 0.58 && phase < 0.99;
  let showSun = true;
  let frac: number;
  if (phase < 0.58) {
    frac = (phase - 0.04) / 0.52;
  } else {
    showSun = false;
    frac = (phase - 0.6) / 0.38;
  }
  frac = Math.min(1, Math.max(0, frac));

  const starAlpha = Math.min(1, Math.max(0, (0.55 - light) * 4));

  const totalMin = (6 + phase * 24) % 24;
  const hh = Math.floor(totalMin);
  const mm = Math.floor((totalMin - hh) * 60);

  return {
    phase,
    label: labelOf(phase),
    isNight,
    skyTop: rgb(top),
    skyBottom: rgb(bot),
    tint: `rgba(${tintC[0]}, ${tintC[1]}, ${tintC[2]}, ${a.toFixed(3)})`,
    orbX: 0.08 + frac * 0.84,
    orbY: 0.6 - Math.sin(frac * Math.PI) * 0.5,
    showSun,
    starAlpha,
    lightLevel: light,
    clock: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
  };
}
