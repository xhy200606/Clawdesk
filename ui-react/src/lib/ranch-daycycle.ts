/**
 * 牧场昼夜循环 —— 按物理（真实本地）时间驱动：
 * 现在几点，牧场就是几点。太阳 06:00-18:40 沿弧线走过，
 * 月亮与星星在夜里接棒；天空渐变 / 色调 / 3D 灯光全部随之变化。
 *
 * 2D 场景用它渲染天空渐变 / 太阳月亮 / 星星 / 色调滤镜，
 * 3D 场景用它缩放灯光强度与背景色，两端视觉节奏一致。
 */
import { useEffect, useState } from "react";

export type DayPhaseInfo = {
  /** 0..1，0 = 午夜 00:00，1 = 次日午夜（物理时间） */
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
  /** 牧场时钟 hh:mm（即真实本地时间） */
  clock: string;
};

type Key = {
  t: number;
  top: [number, number, number];
  bot: [number, number, number];
  tint: [number, number, number];
  a: number;
  light: number;
};

// 关键帧（t = 当天时刻比例，0 = 午夜）：
// 深夜 → 破晓(05:30) → 清晨(06:30) → 白天(08:00) → 黄昏(18:30) → 夜晚(19:55) → 深夜
const KEYS: Key[] = [
  { t: 0.0, top: [14, 20, 46], bot: [32, 44, 84], tint: [12, 18, 48], a: 0.4, light: 0.3 },
  { t: 0.21, top: [18, 24, 54], bot: [40, 50, 92], tint: [16, 22, 54], a: 0.38, light: 0.32 },
  { t: 0.27, top: [64, 70, 118], bot: [248, 158, 112], tint: [255, 150, 90], a: 0.16, light: 0.6 },
  { t: 0.34, top: [108, 168, 235], bot: [198, 228, 250], tint: [255, 255, 255], a: 0, light: 1 },
  { t: 0.69, top: [88, 158, 235], bot: [188, 224, 250], tint: [255, 255, 255], a: 0, light: 1 },
  { t: 0.77, top: [126, 92, 142], bot: [250, 162, 92], tint: [255, 128, 64], a: 0.2, light: 0.72 },
  { t: 0.83, top: [14, 20, 46], bot: [32, 44, 84], tint: [12, 18, 48], a: 0.4, light: 0.3 },
  { t: 1.0, top: [14, 20, 46], bot: [32, 44, 84], tint: [12, 18, 48], a: 0.4, light: 0.3 },
];

// 太阳在地平线上的时段：06:00 → 18:40；月亮接管其余时间
const SUNRISE = 0.25;
const SUNSET = 0.778;

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const mix = (c1: [number, number, number], c2: [number, number, number], f: number) =>
  [0, 1, 2].map((i) => Math.round(lerp(c1[i], c2[i], f))) as [number, number, number];
const rgb = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function labelOf(t: number): string {
  if (t < 0.25 || t >= 0.83) return "夜晚";
  if (t < 0.32) return "清晨";
  if (t < 0.71) return "白天";
  return "黄昏";
}

/** 把 0..1 的时刻比例映射为 hh:mm 字符串 */
function clockOf(t: number): string {
  const totalMin = t * 24 * 60;
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = Math.floor(totalMin % 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** 当前物理时刻比例（0 = 本地午夜） */
function physicalPhase(): number {
  const now = new Date();
  return (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) / (24 * 60);
}

/** 星空（2D/3D 共用）：x/y 为视口百分比，delay 为闪烁相位秒数 */
export const DAYCYCLE_STARS: Array<[number, number, number]> = [
  [4, 12, 0],
  [9, 22, 1.2],
  [14, 8, 0.6],
  [19, 30, 2],
  [24, 15, 0.3],
  [29, 5, 1.6],
  [34, 24, 0.9],
  [39, 11, 0.1],
  [44, 32, 1.8],
  [49, 18, 0.5],
  [54, 7, 2.2],
  [59, 27, 1.1],
  [64, 14, 0.7],
  [69, 34, 1.9],
  [74, 9, 0.2],
  [79, 21, 1.4],
  [84, 4, 0.8],
  [89, 29, 2.1],
  [94, 16, 1.0],
  [97, 8, 0.4],
  [12, 38, 1.5],
  [37, 40, 0.6],
  [62, 41, 1.7],
  [82, 38, 0.9],
  [47, 3, 1.3],
  [72, 42, 0.5],
];

export function useRanchDayCycle(intervalMs = 1000): DayPhaseInfo {
  const [phase, setPhase] = useState(physicalPhase);
  useEffect(() => {
    const id = window.setInterval(() => setPhase(physicalPhase()), intervalMs);
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

  // 太阳：06:00→18:40 沿弧线；月亮：18:40→次日 06:00（跨午夜）
  const isNight = phase < 0.245 || phase >= SUNSET;
  let showSun = true;
  let frac: number;
  if (phase >= SUNRISE && phase < SUNSET) {
    frac = (phase - SUNRISE) / (SUNSET - SUNRISE);
  } else {
    showSun = false;
    frac = ((phase - SUNSET + 1) % 1) / (1 + SUNRISE - SUNSET);
  }
  frac = Math.min(1, Math.max(0, frac));

  const starAlpha = Math.min(1, Math.max(0, (0.55 - light) * 4));

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
    clock: clockOf(phase),
  };
}
