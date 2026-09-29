/**
 * 牧场天气系统 —— 每 60 分钟随机刷新一次（晴 / 雨 / 雪 / 雾）。
 *
 * 天气由「UTC 小时槽号」确定性派生（hash(slot)），因此：
 *  - 所有客户端（2D / 3D / 不同浏览器）同一小时看到的天气一致；
 *  - 无需网关或本地存储持久化；
 *  - 自然滚动：每个整点自动切换为新随机天气。
 */

export type RanchWeather = "sunny" | "overcast" | "rain" | "storm" | "snow" | "fog";

export type RanchWeatherInfo = {
  weather: RanchWeather;
  /** 中文标签（显示在时钟徽章旁） */
  label: string;
  /** 天气图标（emoji，轻量无需 svg） */
  icon: string;
  /** 本时段的伪随机种子（用于确定性的粒子/雨滴布局） */
  seed: number;
  /** 距下次天气刷新的秒数 */
  nextInSec: number;
};

const SLOTS: Array<{ w: RanchWeather; p: number; label: string; icon: string }> = [
  { w: "sunny", p: 0.3, label: "晴朗", icon: "☀️" },
  { w: "overcast", p: 0.5, label: "阴天", icon: "☁️" },
  { w: "rain", p: 0.68, label: "下雨", icon: "🌧️" },
  { w: "storm", p: 0.78, label: "雷暴", icon: "⛈️" },
  { w: "fog", p: 0.89, label: "大雾", icon: "🌫️" },
  { w: "snow", p: 1.0, label: "下雪", icon: "❄️" },
];

/** 整数散列（xorshift），把小时槽号映射为均匀分布的 32 位无符号数 */
function hash(n: number): number {
  let x = n | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/** 由种子派生第 i 个 0..1 伪随机数（确定性，避免 SSR/重渲染抖动） */
export function seededRand(seed: number, i: number): number {
  return hash(hash(seed + i * 0x9e3779b1) ^ (i * 0x85ebca6b)) / 4294967296;
}

// ── 地面积雪：下雪时记录「积雪保留至」时刻（雪停后残留 2 小时渐融） ──
const SNOW_UNTIL_KEY = "ranchSnowUntil";
const SNOW_LINGER_MS = 2 * 60 * 60 * 1000;

/** 当前地面是否被雪覆盖；melting = 雪停后的残留融化态 */
export function snowCoverNow(weather: RanchWeather): { active: boolean; melting: boolean } {
  if (weather === "snow") return { active: true, melting: false };
  const until = Number(localStorage.getItem(SNOW_UNTIL_KEY) || 0);
  if (Date.now() < until) return { active: true, melting: true };
  return { active: false, melting: false };
}

/** 下雪时刷新保留时刻（组件 effect 内调用） */
export function markSnowCover(weather: RanchWeather): void {
  if (weather === "snow") {
    localStorage.setItem(SNOW_UNTIL_KEY, String(Date.now() + SNOW_LINGER_MS));
  }
}

/** 生成随机积雪块（世界百分比坐标 + 像素尺寸；同 seed 稳定） */
export function snowPatches(
  seed: number,
  count: number,
): Array<{ x: number; y: number; r: number; sq: number; rot: number }> {
  const out: Array<{ x: number; y: number; r: number; sq: number; rot: number }> = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: 4 + seededRand(seed, i * 4 + 1) * 92,
      y: 4 + seededRand(seed, i * 4 + 2) * 92,
      r: 26 + seededRand(seed, i * 4 + 3) * 60,
      sq: 0.5 + seededRand(seed, i * 4 + 4) * 0.25,
      rot: seededRand(seed, i * 4 + 5) * 180,
    });
  }
  return out;
}

const HOUR_MS = 60 * 60 * 1000;

export function ranchWeatherNow(ts = Date.now()): RanchWeatherInfo {
  const slot = Math.floor(ts / HOUR_MS);
  const r = (hash(slot * 0x27d4eb2f) % 10000) / 10000;
  const slotInfo = SLOTS.find((s) => r <= s.p) ?? SLOTS[0];
  return {
    weather: slotInfo.w,
    label: slotInfo.label,
    icon: slotInfo.icon,
    seed: hash(slot) % 1000000,
    nextInSec: Math.max(0, Math.round(((slot + 1) * HOUR_MS - ts) / 1000)),
  };
}

import { useEffect, useState } from "react";

/** React hook：当前天气（每 30s 轮询一次槽号变化，整点自动切换） */
export function useRanchWeather(pollMs = 30_000): RanchWeatherInfo {
  const [info, setInfo] = useState(() => ranchWeatherNow());
  useEffect(() => {
    const id = window.setInterval(() => setInfo(ranchWeatherNow()), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs]);
  return info;
}
