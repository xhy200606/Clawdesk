/**
 * RanchScene2D.tsx — React SVG pixel-art ranch scene
 * State-driven agent behaviors inspired by openclaw-office:
 * thinking / tool_calling / speaking / idle / error / spawning
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { resolveAgentAppearance } from "../../lib/animals.ts";
import { useRanchDayCycle, DAYCYCLE_STARS } from "../../lib/ranch-daycycle.ts";
import type { GatewayAgentRow, SessionActivityResult } from "../../lib/types.ts";
import { AgentAppearance } from "./AgentAppearance.tsx";

// ─── Types ──────────────────────────────────────────────────────────

/** Estado base de gateway: processing/waiting/idle */
type AgentState = "processing" | "waiting" | "idle" | "error";

/** Estado visual detallado, imita AgentVisualStatus de openclaw-office */
type RanchVisualStatus = "thinking" | "tool_calling" | "speaking" | "idle" | "error" | "spawning";

type RanchZone = {
  left: number;
  top: number;
  label: string;
};

type AnimalData = {
  id: string;
  name: string;
  appearance: ReturnType<typeof resolveAgentAppearance>;
  baseState: AgentState;
  visualStatus: RanchVisualStatus;
  zone: RanchZone;
  style: React.CSSProperties;
  activityLabel: string;
  toolName: string | null;
  queueDepth?: number;
  lastActivityAgo?: number;
};

// ─── Constants ──────────────────────────────────────────────────────

// ── Zone definitions: cada visual status tiene una zona del mapa ──

const ZONES: Record<RanchVisualStatus, RanchZone> = {
  thinking: { left: 14, top: 16, label: "谷仓前" }, // Cerca del granero
  tool_calling: { left: 82, top: 10, label: "风车旁" }, // Junto al molino
  speaking: { left: 42, top: 50, label: "告示牌" }, // Junto al cartel
  idle: { left: 58, top: 28, label: "池塘边" }, // Cerca del estanque
  error: { left: 30, top: 68, label: "原地" }, // En el sitio
  spawning: { left: 17, top: 22, label: "谷仓门口" }, // Puerta del granero
};

// ── Cycle sub-states when agent is processing ──
// 'processing' cycles: thinking(3s) → tool_calling(2s) → speaking(2s) → repeat
const PROCESSING_CYCLE: { status: RanchVisualStatus; duration: number; toolName: string | null }[] =
  [
    { status: "thinking", duration: 3000, toolName: null },
    { status: "tool_calling", duration: 2000, toolName: "execute" },
    { status: "speaking", duration: 2000, toolName: null },
  ];
const CYCLE_TOTAL = PROCESSING_CYCLE.reduce((s, c) => s + c.duration, 0);

function getProcessingSubState(agentIdx: number): {
  status: RanchVisualStatus;
  toolName: string | null;
} {
  // Offset por agent para desincronizar las animaciones
  const offset = agentIdx * 1300;
  const t = (Date.now() + offset) % CYCLE_TOTAL;
  let acc = 0;
  for (const phase of PROCESSING_CYCLE) {
    acc += phase.duration;
    if (t < acc) return { status: phase.status, toolName: phase.toolName };
  }
  return PROCESSING_CYCLE[0];
}

// ── Phrases ──

const PHRASES: Record<RanchVisualStatus, string[]> = {
  thinking: ["嗯...让我想想 🤔", "大脑高速运转中 🧠", "逻辑推理中... 🔮", "思考人生 🌌"],
  tool_calling: ["正在使用工具 🔧", "蹄子敲击中 ⌨️", "执行命令 ⚡", "调用 API 中 🌐"],
  speaking: ["汇报结果！📋", "写完了！来看 📝", "输出中... 💬", "任务完成 ✅"],
  idle: [
    "哞~ 别烦我 🛌",
    "Zzz... 摸鱼中 🐟",
    "404: 动力未找到 🫠",
    "摸鱼是一种艺术 🎨",
    "电量不足，请充值 🔋",
    "别看我，去找PM 😏",
  ],
  error: ["救命！出bug了 🐛", "系统崩溃了 💥", "需要兽医 🏥", "错误404: 饲料未找到 🚫"],
  spawning: ["来了来了！🏃", "打卡上班 ⏰"],
};

const FEED_PHRASES = [
  "好吃！谢谢老板 🥺",
  "饲料真香 😋",
  "加鸡腿！🍗",
  "饱了饱了 🫃",
  "老板大气！💰",
];
const WHIP_PHRASES = [
  "啊！别打了！😭",
  "我干我干！🏃",
  "工伤算谁的？🤕",
  "要加班费！💢",
  "999举报了！📞",
];

// ── Activity labels per visual status ──
const ACTIVITY_LABELS: Record<RanchVisualStatus, string> = {
  thinking: "思考中",
  tool_calling: "使用工具",
  speaking: "汇报中",
  idle: "摸鱼中",
  error: "出错了",
  spawning: "上班中",
};

// ─── Pixel Art SVG Components ───────────────────────────────────────

function PixelTree({ size = "sm" }: { size?: "sm" | "lg" }) {
  const w = size === "lg" ? 40 : 32;
  const h = size === "lg" ? 48 : 40;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 32 40"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="13" y="28" width="6" height="12" fill="#8b7340" />
      <rect x="14" y="28" width="2" height="12" fill="#a08848" opacity="0.5" />
      <rect x="4" y="12" width="24" height="16" rx="4" fill="#5a7e36" />
      <rect x="6" y="8" width="20" height="14" rx="4" fill="#7a9e4e" />
      <rect x="8" y="4" width="16" height="10" rx="3" fill="#94b85e" />
      <rect x="10" y="6" width="6" height="4" rx="2" fill="#a8c86e" opacity="0.6" />
      <rect x="18" y="10" width="4" height="3" rx="1" fill="#a8c86e" opacity="0.4" />
      <rect x="6" y="22" width="20" height="4" rx="2" fill="#4a6e2a" opacity="0.4" />
    </svg>
  );
}

function PixelBarn() {
  return (
    <svg
      width="64"
      height="56"
      viewBox="0 0 64 56"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="4" y="48" width="56" height="8" rx="2" fill="rgba(0,0,0,0.12)" />
      <rect x="4" y="20" width="56" height="32" fill="#d4b87a" />
      <rect
        x="4"
        y="20"
        width="56"
        height="32"
        rx="1"
        fill="none"
        stroke="#b89858"
        strokeWidth="1"
      />
      <rect x="4" y="28" width="56" height="1" fill="#c4a868" opacity="0.5" />
      <rect x="4" y="36" width="56" height="1" fill="#c4a868" opacity="0.5" />
      <rect x="4" y="44" width="56" height="1" fill="#c4a868" opacity="0.5" />
      <polygon points="0,22 32,4 64,22" fill="#c87848" />
      <polygon points="4,22 32,6 60,22" fill="#d88858" />
      <polygon points="10,20 32,8 40,16" fill="#e8a070" opacity="0.4" />
      <rect x="0" y="20" width="64" height="3" fill="#b06838" />
      <rect x="24" y="34" width="16" height="18" rx="1" fill="#6a5030" />
      <rect x="25" y="35" width="14" height="16" fill="#7a6040" />
      <rect x="31" y="35" width="2" height="16" fill="#6a5030" />
      <rect x="8" y="28" width="10" height="10" rx="1" fill="#a8c8b0" />
      <rect
        x="8"
        y="28"
        width="10"
        height="10"
        rx="1"
        fill="none"
        stroke="#b89858"
        strokeWidth="1"
      />
      <rect x="12" y="28" width="2" height="10" fill="#b89858" />
      <rect x="8" y="32" width="10" height="2" fill="#b89858" />
      <rect x="46" y="28" width="10" height="10" rx="1" fill="#a8c8b0" />
      <rect
        x="46"
        y="28"
        width="10"
        height="10"
        rx="1"
        fill="none"
        stroke="#b89858"
        strokeWidth="1"
      />
      <rect x="50" y="28" width="2" height="10" fill="#b89858" />
      <rect x="46" y="32" width="10" height="2" fill="#b89858" />
    </svg>
  );
}

function PixelFenceH({ width }: { width: number }) {
  const posts = Array.from({ length: Math.floor(width / 16) + 1 }, (_, i) => i * 16);
  return (
    <svg
      width={width}
      height="16"
      viewBox={`0 0 ${width} 16`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      {posts.map((x) => (
        <React.Fragment key={x}>
          <rect x={x} y="0" width="4" height="16" fill="#a07020" />
          <rect x={x} y="0" width="2" height="16" fill="#b08030" opacity="0.5" />
        </React.Fragment>
      ))}
      <rect x="0" y="3" width={width} height="3" fill="#c09040" />
      <rect x="0" y="4" width={width} height="1" fill="#d0a050" opacity="0.5" />
      <rect x="0" y="10" width={width} height="3" fill="#c09040" />
      <rect x="0" y="11" width={width} height="1" fill="#d0a050" opacity="0.5" />
    </svg>
  );
}

function PixelFenceV({ height }: { height: number }) {
  const posts = Array.from({ length: Math.floor(height / 16) + 1 }, (_, i) => i * 16);
  return (
    <svg
      width="16"
      height={height}
      viewBox={`0 0 16 ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      {posts.map((y) => (
        <React.Fragment key={y}>
          <rect x="0" y={y} width="16" height="4" fill="#a07020" />
          <rect x="0" y={y} width="16" height="2" fill="#b08030" opacity="0.5" />
        </React.Fragment>
      ))}
      <rect x="3" y="0" width="3" height={height} fill="#c09040" />
      <rect x="4" y="0" width="1" height={height} fill="#d0a050" opacity="0.5" />
      <rect x="10" y="0" width="3" height={height} fill="#c09040" />
      <rect x="11" y="0" width="1" height={height} fill="#d0a050" opacity="0.5" />
    </svg>
  );
}

function PixelPond() {
  return (
    <svg
      width="72"
      height="48"
      viewBox="0 0 72 48"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <ellipse cx="36" cy="24" rx="34" ry="22" fill="#2d5a4a" />
      <ellipse cx="36" cy="24" rx="30" ry="18" fill="#3d7b6a" />
      <ellipse cx="36" cy="22" rx="26" ry="14" fill="#4a9e8a" />
      <rect x="18" y="16" width="12" height="2" rx="1" fill="#6ab8a0" opacity="0.5" />
      <rect x="34" y="20" width="8" height="2" rx="1" fill="#6ab8a0" opacity="0.5" />
      <rect x="24" y="26" width="10" height="2" rx="1" fill="#6ab8a0" opacity="0.3" />
      <rect x="4" y="18" width="4" height="3" rx="1" fill="#8a8878" />
      <rect x="60" y="26" width="5" height="3" rx="1" fill="#8a8878" />
      <rect x="16" y="38" width="4" height="3" rx="1" fill="#8a8878" />
    </svg>
  );
}

function PixelSmallHouse({ roofColor = "#7a9e4e" }: { roofColor?: string }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="4" y="34" width="32" height="6" rx="1" fill="rgba(0,0,0,0.1)" />
      <rect x="4" y="18" width="32" height="18" fill="#ece0c8" />
      <rect x="4" y="18" width="32" height="18" fill="none" stroke="#d4c8a8" strokeWidth="1" />
      <rect x="4" y="24" width="32" height="1" fill="#e0d4b8" opacity="0.5" />
      <rect x="4" y="30" width="32" height="1" fill="#e0d4b8" opacity="0.5" />
      <polygon points="0,20 20,6 40,20" fill={roofColor} />
      <polygon points="4,20 20,8 36,20" fill={roofColor} opacity="0.8" />
      <polygon points="10,18 20,10 24,14" fill="white" opacity="0.15" />
      <rect x="0" y="18" width="40" height="3" fill={roofColor} opacity="0.6" />
      <rect x="16" y="24" width="8" height="12" rx="1" fill="#6a5030" />
      <rect x="17" y="25" width="6" height="10" fill="#7a6040" />
      <circle cx="22" cy="30" r="0.8" fill="#c4a060" />
      <rect x="6" y="22" width="7" height="7" rx="1" fill="#a8c8b0" />
      <rect x="9" y="22" width="1" height="7" fill="#d4c8a8" />
      <rect x="6" y="25" width="7" height="1" fill="#d4c8a8" />
      <rect x="27" y="22" width="7" height="7" rx="1" fill="#a8c8b0" />
      <rect x="30" y="22" width="1" height="7" fill="#d4c8a8" />
      <rect x="27" y="25" width="7" height="1" fill="#d4c8a8" />
    </svg>
  );
}

function PixelWindmill() {
  return (
    <svg
      width="40"
      height="56"
      viewBox="0 0 40 56"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <ellipse cx="20" cy="54" rx="12" ry="3" fill="rgba(0,0,0,0.1)" />
      <path d="M14 20 L12 52 H28 L26 20 Z" fill="#d8c8b0" />
      <path d="M15 20 L13 50 H27 L25 20 Z" fill="#e8d8c0" />
      <rect x="13" y="30" width="14" height="1" fill="#c8b8a0" opacity="0.5" />
      <rect x="13" y="40" width="14" height="1" fill="#c8b8a0" opacity="0.5" />
      <rect x="17" y="42" width="6" height="10" rx="3" fill="#7a5030" />
      <circle cx="20" cy="32" r="3" fill="#88c8e8" />
      <rect x="19.5" y="29" width="1" height="6" fill="#c8b8a0" />
      <rect x="17" y="31.5" width="6" height="1" fill="#c8b8a0" />
      <circle cx="20" cy="14" r="3" fill="#a09080" />
      <circle cx="20" cy="14" r="2" fill="#b0a090" />
      <g className="windmill-blades" style={{ transformOrigin: "20px 14px" }}>
        <rect x="18" y="-2" width="4" height="16" rx="1" fill="#c8b8a0" />
        <rect x="4" y="12" width="16" height="4" rx="1" fill="#c8b8a0" />
        <rect x="20" y="12" width="16" height="4" rx="1" fill="#c8b8a0" />
        <rect x="18" y="14" width="4" height="16" rx="1" fill="#c8b8a0" />
      </g>
    </svg>
  );
}

function PixelSignpost() {
  return (
    <svg
      width="20"
      height="28"
      viewBox="0 0 20 28"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="9" y="8" width="3" height="20" fill="#8B6914" />
      <rect x="10" y="8" width="1" height="20" fill="#a07820" opacity="0.5" />
      <rect x="2" y="2" width="16" height="8" rx="1" fill="#c49040" />
      <rect
        x="2"
        y="2"
        width="16"
        height="8"
        fill="none"
        stroke="#a07020"
        strokeWidth="0.8"
        rx="1"
      />
      <rect x="4" y="4" width="12" height="1" fill="#a07020" opacity="0.4" />
      <rect x="4" y="7" width="12" height="1" fill="#a07020" opacity="0.4" />
    </svg>
  );
}

function PixelWell() {
  return (
    <svg
      width="24"
      height="28"
      viewBox="0 0 24 28"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <ellipse cx="12" cy="22" rx="10" ry="5" fill="#8a8878" />
      <ellipse cx="12" cy="22" rx="8" ry="3.5" fill="#3d7b6a" />
      <ellipse cx="12" cy="22" rx="6" ry="2.5" fill="#4a9e8a" />
      <rect x="2" y="14" width="20" height="8" rx="2" fill="#a09888" />
      <rect
        x="2"
        y="14"
        width="20"
        height="8"
        fill="none"
        stroke="#887868"
        strokeWidth="0.8"
        rx="2"
      />
      <rect x="4" y="17" width="16" height="1" fill="#887868" opacity="0.3" />
      <rect x="4" y="4" width="2" height="12" fill="#8b7340" />
      <rect x="18" y="4" width="2" height="12" fill="#8b7340" />
      <rect x="1" y="2" width="22" height="4" rx="1" fill="#a08848" />
      <rect x="3" y="1" width="18" height="2" rx="1" fill="#b09858" />
    </svg>
  );
}

function PixelHayBale() {
  return (
    <svg
      width="36"
      height="28"
      viewBox="0 0 36 28"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <ellipse cx="18" cy="26" rx="16" ry="3" fill="rgba(0,0,0,0.1)" />
      <rect x="0" y="14" width="16" height="12" rx="2" fill="#dab040" />
      <rect
        x="0"
        y="14"
        width="16"
        height="12"
        rx="2"
        fill="none"
        stroke="#b89030"
        strokeWidth="1"
      />
      <rect x="2" y="17" width="12" height="1" fill="#c8a038" opacity="0.6" />
      <rect x="2" y="21" width="12" height="1" fill="#c8a038" opacity="0.6" />
      <rect x="18" y="14" width="16" height="12" rx="2" fill="#e0b848" />
      <rect
        x="18"
        y="14"
        width="16"
        height="12"
        rx="2"
        fill="none"
        stroke="#b89030"
        strokeWidth="1"
      />
      <rect x="20" y="17" width="12" height="1" fill="#c8a038" opacity="0.6" />
      <rect x="20" y="21" width="12" height="1" fill="#c8a038" opacity="0.6" />
      <rect x="8" y="4" width="18" height="11" rx="2" fill="#e8c050" />
      <rect
        x="8"
        y="4"
        width="18"
        height="11"
        rx="2"
        fill="none"
        stroke="#c0a040"
        strokeWidth="1"
      />
      <rect x="10" y="7" width="14" height="1" fill="#d0a840" opacity="0.6" />
      <rect x="10" y="11" width="14" height="1" fill="#d0a840" opacity="0.6" />
      <line x1="6" y1="3" x2="9" y2="1" stroke="#e8c850" strokeWidth="1.5" strokeLinecap="round" />
      <line
        x1="22"
        y1="2"
        x2="25"
        y2="0"
        stroke="#e8c850"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PixelFeedTrough() {
  return (
    <svg
      width="40"
      height="24"
      viewBox="0 0 40 24"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="6" y="16" width="3" height="8" fill="#8B6914" />
      <rect x="31" y="16" width="3" height="8" fill="#8B6914" />
      <path d="M2 8 L6 20 H34 L38 8 Z" fill="#a07830" />
      <path d="M4 8 L7 18 H33 L36 8 Z" fill="#b89048" />
      <ellipse cx="14" cy="10" rx="4" ry="2" fill="#78b838" />
      <ellipse cx="22" cy="11" rx="5" ry="2.5" fill="#68a828" />
      <ellipse cx="30" cy="10" rx="3" ry="2" fill="#88c848" />
      <rect x="2" y="7" width="36" height="3" rx="1" fill="#c09840" />
      <rect x="2" y="7" width="36" height="1" fill="#d0a850" opacity="0.5" />
    </svg>
  );
}

function PixelMilkBucket() {
  return (
    <svg
      width="16"
      height="20"
      viewBox="0 0 16 20"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <path d="M3 6 L2 18 H14 L13 6 Z" fill="#b0b0b8" />
      <path d="M4 6 L3 17 H13 L12 6 Z" fill="#c8c8d0" />
      <rect x="2" y="8" width="12" height="2" rx="0.5" fill="#909098" />
      <rect x="2" y="14" width="12" height="2" rx="0.5" fill="#909098" />
      <ellipse cx="8" cy="7" rx="5" ry="2" fill="#f0f0f8" />
      <ellipse cx="8" cy="7" rx="4" ry="1.5" fill="#fff" />
      <path d="M4 4 Q8 0 12 4" stroke="#808088" strokeWidth="1.5" fill="none" />
      <ellipse cx="8" cy="6" rx="5.5" ry="2" fill="none" stroke="#909098" strokeWidth="1" />
    </svg>
  );
}

function PixelCropPatch() {
  return (
    <svg
      width="48"
      height="32"
      viewBox="0 0 48 32"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      <rect x="0" y="4" width="48" height="28" rx="2" fill="#8b7340" opacity="0.4" />
      {[0, 1, 2, 3].map((i) => (
        <React.Fragment key={i}>
          <rect x="2" y={6 + i * 7} width="44" height="4" rx="1" fill="#6a5820" opacity="0.3" />
          <circle cx="8" cy={7 + i * 7} r="2.5" fill="#7a9e4e" />
          <circle cx="16" cy={7 + i * 7} r="3" fill="#8db651" />
          <circle cx="24" cy={7 + i * 7} r="2" fill="#94b85e" />
          <circle cx="32" cy={7 + i * 7} r="3" fill="#7a9e4e" />
          <circle cx="40" cy={7 + i * 7} r="2.5" fill="#8db651" />
        </React.Fragment>
      ))}
    </svg>
  );
}

function PixelGate({ open }: { open: boolean }) {
  return (
    <svg
      width="32"
      height="20"
      viewBox="0 0 32 20"
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated" }}
    >
      {/* Postes de la puerta */}
      <rect x="0" y="0" width="4" height="20" fill="#805020" />
      <rect x="1" y="0" width="1.5" height="20" fill="#906030" opacity="0.5" />
      <rect x="28" y="0" width="4" height="20" fill="#805020" />
      <rect x="29" y="0" width="1.5" height="20" fill="#906030" opacity="0.5" />
      {/* Título pequeño */}
      <rect x="12" y="-2" width="8" height="4" rx="1" fill="#c09040" />
      <rect x="13" y="-1" width="6" height="2" rx="0.5" fill="#d0a050" />
      {/* Puertas animadas con CSS */}
      <g
        className={`ranch-gate-left ${open ? "ranch-gate-left--open" : ""}`}
        style={{ transformOrigin: "2px 10px" }}
      >
        <rect x="4" y="4" width="12" height="3" rx="0.5" fill="#c09040" />
        <rect x="4" y="12" width="12" height="3" rx="0.5" fill="#c09040" />
        <rect x="4" y="4" width="2" height="11" fill="#b08030" />
        <rect x="14" y="4" width="2" height="11" fill="#b08030" />
      </g>
      <g
        className={`ranch-gate-right ${open ? "ranch-gate-right--open" : ""}`}
        style={{ transformOrigin: "30px 10px" }}
      >
        <rect x="16" y="4" width="12" height="3" rx="0.5" fill="#c09040" />
        <rect x="16" y="12" width="12" height="3" rx="0.5" fill="#c09040" />
        <rect x="16" y="4" width="2" height="11" fill="#b08030" />
        <rect x="26" y="4" width="2" height="11" fill="#b08030" />
      </g>
    </svg>
  );
}

// ─── Decoration Items ───────────────────────────────────────────────

type DecoType =
  | "flower1"
  | "flower2"
  | "flower3"
  | "mushroom"
  | "wheat"
  | "rock"
  | "butterfly"
  | "herb";

function DecoItem({ type }: { type: DecoType }) {
  switch (type) {
    case "flower1":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ imageRendering: "pixelated" }}>
          <circle cx="7" cy="3" r="2" fill="#e8c0a0" />
          <circle cx="7" cy="11" r="2" fill="#e8c0a0" />
          <circle cx="3" cy="7" r="2" fill="#e8c0a0" />
          <circle cx="11" cy="7" r="2" fill="#e8c0a0" />
          <circle cx="7" cy="7" r="2" fill="#e8b840" />
        </svg>
      );
    case "flower2":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ imageRendering: "pixelated" }}>
          <circle cx="7" cy="3" r="2" fill="#e8d878" />
          <circle cx="11" cy="5" r="2" fill="#e8d878" />
          <circle cx="11" cy="9" r="2" fill="#e8d878" />
          <circle cx="7" cy="11" r="2" fill="#e8d878" />
          <circle cx="3" cy="9" r="2" fill="#e8d878" />
          <circle cx="3" cy="5" r="2" fill="#e8d878" />
          <circle cx="7" cy="7" r="2" fill="#c89830" />
        </svg>
      );
    case "flower3":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" style={{ imageRendering: "pixelated" }}>
          <ellipse cx="7" cy="3" rx="2" ry="3" fill="#c87858" />
          <ellipse cx="7" cy="11" rx="2" ry="3" fill="#c87858" />
          <ellipse cx="3" cy="7" rx="3" ry="2" fill="#c87858" />
          <ellipse cx="11" cy="7" rx="3" ry="2" fill="#c87858" />
          <circle cx="7" cy="7" r="2" fill="#e8c860" />
        </svg>
      );
    case "mushroom":
      return (
        <svg width="12" height="12" viewBox="0 0 12 12" style={{ imageRendering: "pixelated" }}>
          <ellipse cx="6" cy="5" rx="5" ry="4" fill="#b85838" />
          <rect x="4" y="6" width="4" height="4" rx="1" fill="#ece0c8" />
          <circle cx="4" cy="4" r="1" fill="#ece0c8" opacity="0.8" />
          <circle cx="7" cy="3" r="1" fill="#ece0c8" opacity="0.8" />
        </svg>
      );
    case "wheat":
      return (
        <svg width="10" height="14" viewBox="0 0 10 14" style={{ imageRendering: "pixelated" }}>
          <rect x="4" y="8" width="2" height="6" fill="#a08848" />
          <ellipse cx="5" cy="5" rx="2" ry="4" fill="#c8a838" />
          <rect x="1" y="6" width="2" height="3" rx="1" fill="#c8a838" />
          <rect x="7" y="6" width="2" height="3" rx="1" fill="#c8a838" />
        </svg>
      );
    case "rock":
      return (
        <svg width="12" height="8" viewBox="0 0 12 8" style={{ imageRendering: "pixelated" }}>
          <ellipse cx="6" cy="5" rx="5" ry="3" fill="#9a9080" />
          <ellipse cx="5" cy="4" rx="4" ry="2.5" fill="#b0a898" />
        </svg>
      );
    case "butterfly":
      return (
        <svg width="14" height="10" viewBox="0 0 14 10" style={{ imageRendering: "pixelated" }}>
          <ellipse cx="3" cy="4" rx="3" ry="2" fill="#a8c8a0" opacity="0.85" />
          <ellipse cx="11" cy="4" rx="3" ry="2" fill="#a8c8a0" opacity="0.85" />
          <ellipse cx="3" cy="7" rx="2" ry="1.5" fill="#88b080" opacity="0.7" />
          <ellipse cx="11" cy="7" rx="2" ry="1.5" fill="#88b080" opacity="0.7" />
          <rect x="6" y="2" width="2" height="6" rx="1" fill="#4a4838" />
        </svg>
      );
    case "herb":
      return (
        <svg width="10" height="12" viewBox="0 0 10 12" style={{ imageRendering: "pixelated" }}>
          <rect x="4" y="6" width="2" height="6" fill="#5a7e36" />
          <ellipse cx="3" cy="5" rx="3" ry="2" fill="#7a9e4e" />
          <ellipse cx="7" cy="4" rx="3" ry="2" fill="#7a9e4e" />
          <ellipse cx="5" cy="2" rx="2.5" ry="2" fill="#8db651" />
        </svg>
      );
  }
}

// ─── Scene Layout Data ──────────────────────────────────────────────

const TREES: Array<{ left: string; top: string; size: "sm" | "lg" }> = [
  { left: "0%", top: "0%", size: "lg" },
  { left: "6%", top: "-1%", size: "sm" },
  { left: "30%", top: "0%", size: "sm" },
  { left: "36%", top: "-2%", size: "lg" },
  { left: "90%", top: "0%", size: "lg" },
  { left: "95%", top: "2%", size: "sm" },
  { left: "0%", top: "25%", size: "sm" },
  { left: "-1%", top: "45%", size: "lg" },
  { left: "2%", top: "65%", size: "sm" },
  { left: "94%", top: "30%", size: "sm" },
  { left: "96%", top: "55%", size: "lg" },
  { left: "0%", top: "82%", size: "lg" },
  { left: "7%", top: "85%", size: "sm" },
  { left: "20%", top: "86%", size: "sm" },
  { left: "40%", top: "84%", size: "lg" },
  { left: "60%", top: "86%", size: "sm" },
  { left: "75%", top: "85%", size: "sm" },
  { left: "88%", top: "82%", size: "lg" },
  { left: "95%", top: "84%", size: "sm" },
];

const DECOS: Array<{ left: string; top: string; type: DecoType }> = [
  { left: "14%", top: "30%", type: "flower1" },
  { left: "22%", top: "72%", type: "flower2" },
  { left: "48%", top: "20%", type: "flower3" },
  { left: "78%", top: "80%", type: "flower1" },
  { left: "35%", top: "78%", type: "flower2" },
  { left: "62%", top: "15%", type: "flower2" },
  { left: "85%", top: "42%", type: "flower1" },
  { left: "10%", top: "50%", type: "mushroom" },
  { left: "42%", top: "65%", type: "mushroom" },
  { left: "68%", top: "22%", type: "wheat" },
  { left: "25%", top: "40%", type: "wheat" },
  { left: "55%", top: "85%", type: "flower3" },
  { left: "92%", top: "60%", type: "flower2" },
  { left: "16%", top: "18%", type: "rock" },
  { left: "70%", top: "75%", type: "rock" },
  { left: "45%", top: "38%", type: "butterfly" },
  { left: "30%", top: "58%", type: "butterfly" },
  { left: "80%", top: "30%", type: "herb" },
  { left: "5%", top: "60%", type: "herb" },
];

// ─── Per-state SVG Indicators ───────────────────────────────────────

/** Tres puntos rebotando sobre la cabeza del animal (imitando ThinkingDots de office) */
function ThinkingDotsIndicator() {
  return (
    <div className="ranch-indicator ranch-indicator--thinking">
      <svg width="28" height="12" viewBox="0 0 28 12" style={{ imageRendering: "pixelated" }}>
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={6 + i * 8}
            cy={6}
            r={3}
            fill="#3b82f6"
            style={{ animation: `ranch-dot-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
          />
        ))}
      </svg>
    </div>
  );
}

/** Etiqueta de herramienta con animación de engranaje */
function ToolCallIndicator({ toolName }: { toolName: string | null }) {
  return (
    <div className="ranch-indicator ranch-indicator--tool">
      <span className="ranch-tool-badge">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        {toolName ?? "tool"}
      </span>
    </div>
  );
}

/** Boca animada + burbuja de texto para speaking */
function SpeakingIndicator() {
  return (
    <div className="ranch-indicator ranch-indicator--speaking">
      <svg width="20" height="16" viewBox="0 0 20 16" style={{ imageRendering: "pixelated" }}>
        <rect x="2" y="0" width="16" height="11" rx="3" fill="#a855f7" />
        <polygon points="6,11 10,15 8,11" fill="#a855f7" />
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={5 + i * 4}
            y={4}
            width={2.5}
            height={2}
            rx={0.5}
            fill="#fff"
            style={{ animation: `ranch-speak-dot 0.8s ease ${i * 0.12}s infinite` }}
          />
        ))}
      </svg>
    </div>
  );
}

// 星星坐标（百分比，确定性伪随机，避免每次渲染跳动）
// 星空数据已移入 lib/ranch-daycycle.ts（2D/3D 共用）

// ─── Animal Component ───────────────────────────────────────────────

function RanchAnimal({ animal, onBubble }: { animal: AnimalData; onBubble: (id: string) => void }) {
  // 执行任务时附加奔跑动画（ranch-run 左右往返 + 步频）；空闲/等待静止
  const cls = `ranch-animal ranch-animal--${animal.visualStatus}${animal.baseState === "processing" ? " ranch-animal--running" : ""}`;

  return (
    <div
      className={cls}
      style={animal.style}
      onClick={() => onBubble(animal.id)}
      title={`${animal.name} — ${animal.visualStatus}`}
    >
      {/* Per-state indicators */}
      {animal.visualStatus === "thinking" && <ThinkingDotsIndicator />}
      {animal.visualStatus === "tool_calling" && <ToolCallIndicator toolName={animal.toolName} />}
      {animal.visualStatus === "speaking" && <SpeakingIndicator />}
      {animal.visualStatus === "idle" && <span className="ranch-zzz">💤</span>}
      {animal.visualStatus === "error" && <span className="ranch-error-icon">⚠️</span>}
      {animal.visualStatus === "spawning" && <span className="ranch-spawn-flash">✨</span>}

      <AgentAppearance {...animal.appearance} className="ranch-animal__sprite" />
      <div className="ranch-animal__name">{animal.name}</div>
      <div className={`ranch-animal__activity ranch-animal__activity--${animal.visualStatus}`}>
        {animal.activityLabel}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export type RanchScene2DProps = {
  agents: GatewayAgentRow[];
  sessionActivity: SessionActivityResult | null;
  zoom: number;
  onZoom: (next: number) => void;
};

export function RanchScene2D({ agents, sessionActivity, zoom, onZoom }: RanchScene2DProps) {
  const sceneRef = useRef<HTMLDivElement>(null);
  // 牧场昼夜循环（10 分钟一天）
  const day = useRanchDayCycle();
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panRef = useRef(pan);
  panRef.current = pan;
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const clampPan = useCallback((x: number, y: number, level: number) => {
    const scene = sceneRef.current;
    if (!scene || level <= 1) return { x: 0, y: 0 };
    return {
      x: Math.max(
        -((level - 1) * scene.clientWidth) / 2,
        Math.min(((level - 1) * scene.clientWidth) / 2, x),
      ),
      y: Math.max(
        -((level - 1) * scene.clientHeight) / 2,
        Math.min(((level - 1) * scene.clientHeight) / 2, y),
      ),
    };
  }, []);
  useEffect(() => setPan((current) => clampPan(current.x, current.y, zoom)), [zoom, clampPan]);
  // 需求：牛马档案形象不再自主游走——空闲时安静待在自己的位置，
  // 只有执行任务（processing）时才有奔跑动画（见 RanchAnimal 的 ranch-animal--running）。
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoom(Math.min(2.5, Math.max(1, zoomRef.current + (event.deltaY < 0 ? 0.1 : -0.1))));
    };
    let pinchDistance = 0;
    let pinchZoom = zoomRef.current;
    let touchPan: { x: number; y: number } | null = null;
    const distance = (touches: TouchList) =>
      Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1 && zoomRef.current > 1) {
        touchPan = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        return;
      }
      if (event.touches.length !== 2) return;
      touchPan = null;
      pinchDistance = distance(event.touches);
      pinchZoom = zoomRef.current;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && touchPan && zoomRef.current > 1) {
        event.preventDefault();
        const touch = event.touches[0];
        setPan((current) =>
          clampPan(
            current.x + touch.clientX - touchPan!.x,
            current.y + touch.clientY - touchPan!.y,
            zoomRef.current,
          ),
        );
        touchPan = { x: touch.clientX, y: touch.clientY };
        return;
      }
      if (event.touches.length !== 2 || pinchDistance === 0) return;
      event.preventDefault();
      onZoom(Math.min(2.5, Math.max(0.7, (pinchZoom * distance(event.touches)) / pinchDistance)));
    };
    scene.addEventListener("wheel", handleWheel, { passive: false });
    scene.addEventListener("touchstart", handleTouchStart);
    scene.addEventListener("touchmove", handleTouchMove, { passive: false });
    const handleTouchEnd = () => {
      touchPan = null;
      pinchDistance = 0;
    };
    scene.addEventListener("touchend", handleTouchEnd);
    return () => {
      scene.removeEventListener("wheel", handleWheel);
      scene.removeEventListener("touchstart", handleTouchStart);
      scene.removeEventListener("touchmove", handleTouchMove);
      scene.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onZoom, clampPan]);
  const [bubbles, setBubbles] = useState<
    Map<string, { phrase: string; timer: ReturnType<typeof setTimeout> }>
  >(new Map());
  const bubblesRef = useRef(bubbles);
  bubblesRef.current = bubbles;

  // Re-render periódico para actualizar el sub-estado cycling de processing agents
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 800);
    return () => clearInterval(id);
  }, []);

  // Limpia timers al desmontar
  useEffect(() => {
    return () => {
      for (const b of bubblesRef.current.values()) clearTimeout(b.timer);
    };
  }, []);

  const triggerBubble = useCallback((agentId: string, phrases: string[]) => {
    setBubbles((prev) => {
      const next = new Map(prev);
      const existing = next.get(agentId);
      if (existing) clearTimeout(existing.timer);
      const phrase = phrases[Math.floor(Math.random() * phrases.length)];
      const timer = setTimeout(() => {
        setBubbles((p) => {
          const m = new Map(p);
          m.delete(agentId);
          return m;
        });
      }, 2000);
      next.set(agentId, { phrase, timer });
      return next;
    });
  }, []);

  // Mapa de estado base de cada agent
  const agentStateMap = useMemo(() => {
    const map = new Map<string, AgentState>();
    if (sessionActivity) {
      for (const s of sessionActivity.sessions) {
        const agentId = s.key.split(":")[1] ?? s.key;
        const cur = map.get(agentId);
        if (!cur || s.state === "processing") map.set(agentId, s.state);
      }
    }
    return map;
  }, [sessionActivity]);

  // Mapa de datos de sesión extra
  const agentSessionMap = useMemo(() => {
    const map = new Map<string, { queueDepth?: number; lastActivityAgo?: number }>();
    if (sessionActivity) {
      for (const s of sessionActivity.sessions) {
        const agentId = s.key.split(":")[1] ?? s.key;
        if (!map.has(agentId)) {
          map.set(agentId, { queueDepth: s.queueDepth, lastActivityAgo: s.lastActivityAgo });
        }
      }
    }
    return map;
  }, [sessionActivity]);

  const handleBubble = useCallback(
    (agentId: string) => {
      // Determinar visual status para seleccionar frases apropiadas
      const baseState = agentStateMap.get(agentId) ?? "idle";
      const idx = agents.findIndex((a) => a.id === agentId);
      let vs: RanchVisualStatus = "idle";
      if (baseState === "processing") {
        vs = getProcessingSubState(idx).status;
      } else if (baseState === "waiting") {
        vs = "idle";
      } else if (baseState === "error") {
        vs = "error";
      }
      triggerBubble(agentId, PHRASES[vs]);
    },
    [triggerBubble, agentStateMap, agents],
  );

  // Determinar si la puerta del corral debe estar abierta
  const gateOpen = useMemo(() => {
    for (let idx = 0; idx < agents.length; idx++) {
      const baseState = agentStateMap.get(agents[idx].id) ?? "idle";
      if (baseState === "processing") {
        const sub = getProcessingSubState(idx);
        if (sub.status === "tool_calling") return true;
      }
    }
    return false;
  }, [agents, agentStateMap]);

  // 游走目标（相对偏移 px）：空闲在围栏圈内悠闲走动，工作在槽位附近小范围活动。
  // 每 ~3.6s 换一次目标点，配合 CSS transition 平滑移动；个体间隔随机自然。
  const [wander, setWander] = useState<Record<string, { dx: number; dy: number }>>({});
  useEffect(() => {
    const step = () =>
      setWander((current) => {
        const next: Record<string, { dx: number; dy: number }> = { ...current };
        const rnd = (range: number) => Math.round((Math.random() - 0.5) * range);
        for (let idx = 0; idx < agents.length; idx++) {
          const agent = agents[idx];
          const base = agentStateMap.get(agent.id) ?? "idle";
          next[agent.id] =
            base === "processing" ? { dx: rnd(40), dy: rnd(26) } : { dx: rnd(250), dy: rnd(52) };
        }
        return next;
      });
    step();
    const timer = window.setInterval(step, 3600);
    return () => window.clearInterval(timer);
  }, [agents, agentStateMap]);

  // Construir lista de animales con visual status y zona
  const animals = useMemo<AnimalData[]>(() => {
    return agents.map((agent, idx) => {
      const agentId = agent.id;
      const name = agent.identity?.name ?? agent.name ?? agentId;
      const baseState = agentStateMap.get(agentId) ?? "idle";
      const appearance = resolveAgentAppearance(agent.identity, idx);
      const sess = agentSessionMap.get(agentId);

      // Determina visual status
      let visualStatus: RanchVisualStatus;
      let toolName: string | null = null;

      if (baseState === "processing") {
        const sub = getProcessingSubState(idx);
        visualStatus = sub.status;
        toolName = sub.toolName;
      } else if (baseState === "waiting") {
        visualStatus = "idle";
      } else if (baseState === "error") {
        visualStatus = "error";
      } else {
        visualStatus = "idle";
      }

      // Asigna zona y posición basada en visual status
      const zone = ZONES[visualStatus];
      const offsetX = (idx % 3) * 5 - 5;
      const offsetY = Math.floor(idx / 3) * 6;

      // 游走模型：空闲（含等待/异常）在圈内悠闲走动；
      // 执行任务时在对应工作位置的槽位附近小范围活动。
      const walk = wander[agentId] ?? { dx: 0, dy: 0 };
      const style: React.CSSProperties =
        baseState === "processing"
          ? {
              left: `calc(${zone.left + offsetX}% + ${walk.dx}px)`,
              top: `calc(${zone.top + offsetY}% + ${walk.dy}px)`,
              transition: "left 3.4s ease-in-out, top 3.4s ease-in-out",
            }
          : {
              // 圈内游走：以围栏中心 (52%, 18%) 为基准的横向带状区域
              left: `calc(52% + ${walk.dx}px)`,
              top: `calc(18% + ${walk.dy}px)`,
              transition: "left 3.4s ease-in-out, top 3.4s ease-in-out",
            };

      if (baseState === "processing") {
        const isHot = sess?.lastActivityAgo != null && sess.lastActivityAgo < 5000;
        (style as Record<string, string>)["--work-speed"] = isHot ? "0.35s" : "0.75s";
        (style as Record<string, string>)["--run-duration"] = `${4.5 + (idx % 3) * 1.3}s`;
      }

      const activityLabel = baseState === "waiting" ? "等待接单" : ACTIVITY_LABELS[visualStatus];

      return {
        id: agentId,
        name,
        appearance,
        baseState,
        visualStatus,
        zone,
        style,
        activityLabel,
        toolName,
        ...sess,
      };
    });
  }, [agents, agentStateMap, agentSessionMap, wander]);

  if (!agents || agents.length === 0) return null;

  const pc = sessionActivity?.processing ?? 0;
  const wc = sessionActivity?.waiting ?? 0;
  const ic = Math.max(0, agents.length - pc - wc);
  const status = sessionActivity ? `▶${pc} ◷${wc} ◌${ic}` : "加载中...";

  return (
    <div
      className={`ranch-scene${zoom > 1 ? " ranch-scene--pannable" : ""}`}
      ref={sceneRef}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && zoom > 1) {
          dragRef.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        if (dragRef.current) {
          const { x, y } = dragRef.current;
          setPan((current) =>
            clampPan(current.x + event.clientX - x, current.y + event.clientY - y, zoom),
          );
          dragRef.current = { x: event.clientX, y: event.clientY };
        }
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      {/* ── 昼夜循环：天空 / 日月（世界层之下） ── */}
      <div
        className="ranch-daycycle"
        style={{ background: `linear-gradient(${day.skyTop} 0%, ${day.skyBottom} 100%)` }}
        aria-hidden
      />
      <div
        className={day.showSun ? "ranch-daycycle__sun" : "ranch-daycycle__moon"}
        style={{ left: `${day.orbX * 100}%`, top: `${day.orbY * 100}%` }}
        aria-hidden
      />
      {day.starAlpha > 0.02 &&
        DAYCYCLE_STARS.map(([sx, sy, delay], i) => (
          <span
            key={i}
            className="ranch-daycycle__star"
            style={{
              left: `${sx}%`,
              top: `${sy}%`,
              opacity: day.starAlpha,
              animationDelay: `${delay}s`,
            }}
            aria-hidden
          />
        ))}
      <div
        className="ranch-scene__world"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
      >
        {/* Grass pattern */}
        <div className="ranch-tiles" />

        {/* Dirt paths */}
        <div className="ranch-path ranch-path--h" style={{ left: 0, right: 0, top: "55%" }} />
        <div className="ranch-path ranch-path--v" style={{ left: "45%", top: 0, bottom: 0 }} />
        <div
          className="ranch-path ranch-path--v"
          style={{ left: "20%", top: "55%", height: "45%" }}
        />
        <div
          className="ranch-path ranch-path--h"
          style={{ left: "45%", right: 0, top: "30%", width: "55%", height: 24 }}
        />

        {/* Pond */}
        <div style={{ position: "absolute", left: "6%", top: "64%", zIndex: 2 }}>
          <PixelPond />
        </div>

        {/* Barn */}
        <div className="ranch-barn" style={{ left: "12%", top: "8%" }}>
          <PixelBarn />
        </div>

        {/* Small houses */}
        <div
          style={{
            position: "absolute",
            left: "6%",
            top: "35%",
            zIndex: 4,
            imageRendering: "pixelated",
            pointerEvents: "none",
          }}
        >
          <PixelSmallHouse roofColor="#7a9e4e" />
        </div>
        <div
          style={{
            position: "absolute",
            left: "28%",
            top: "68%",
            zIndex: 4,
            imageRendering: "pixelated",
            pointerEvents: "none",
          }}
        >
          <PixelSmallHouse roofColor="#c87848" />
        </div>
        <div
          style={{
            position: "absolute",
            left: "72%",
            top: "65%",
            zIndex: 4,
            imageRendering: "pixelated",
            pointerEvents: "none",
          }}
        >
          <PixelSmallHouse roofColor="#6a9898" />
        </div>

        {/* Signposts */}
        <div
          style={{
            position: "absolute",
            left: "43%",
            top: "50%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelSignpost />
        </div>
        <div
          style={{
            position: "absolute",
            left: "18%",
            top: "52%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelSignpost />
        </div>

        {/* Water well */}
        <div
          style={{
            position: "absolute",
            left: "82%",
            top: "48%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelWell />
        </div>

        {/* Hay bales */}
        <div
          style={{
            position: "absolute",
            left: "30%",
            top: "12%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelHayBale />
        </div>
        <div
          style={{
            position: "absolute",
            left: "88%",
            top: "72%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelHayBale />
        </div>

        {/* Feed trough */}
        <div
          style={{
            position: "absolute",
            left: "60%",
            top: "42%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelFeedTrough />
        </div>

        {/* Milk buckets */}
        <div
          style={{
            position: "absolute",
            left: "38%",
            top: "48%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelMilkBucket />
        </div>
        <div
          style={{
            position: "absolute",
            left: "75%",
            top: "56%",
            zIndex: 4,
            pointerEvents: "none",
          }}
        >
          <PixelMilkBucket />
        </div>

        {/* Windmill */}
        <div
          style={{ position: "absolute", left: "85%", top: "8%", zIndex: 5, pointerEvents: "none" }}
        >
          <PixelWindmill />
        </div>

        {/* Crop patches */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "72%",
            zIndex: 3,
            pointerEvents: "none",
          }}
        >
          <PixelCropPatch />
        </div>
        <div
          style={{ position: "absolute", left: "8%", top: "78%", zIndex: 3, pointerEvents: "none" }}
        >
          <PixelCropPatch />
        </div>

        {/* Fence pen con puerta animada */}
        <div className="ranch-fence-group" style={{ left: "52%", top: "18%" }}>
          <PixelFenceH width={200} />
        </div>
        {/* Cerca inferior dividida en dos + puerta en el medio */}
        <div
          className="ranch-fence-group"
          style={{ left: "52%", top: "18%", transform: "translateY(90px)" }}
        >
          <PixelFenceH width={80} />
        </div>
        <div
          className="ranch-fence-group"
          style={{ left: "52%", top: "18%", transform: "translateY(76px) translateX(80px)" }}
        >
          <PixelGate open={gateOpen} />
        </div>
        <div
          className="ranch-fence-group"
          style={{ left: "52%", top: "18%", transform: "translateY(90px) translateX(112px)" }}
        >
          <PixelFenceH width={88} />
        </div>
        <div className="ranch-fence-group" style={{ left: "52%", top: "18%" }}>
          <PixelFenceV height={90} />
        </div>
        <div
          className="ranch-fence-group"
          style={{ left: "52%", top: "18%", transform: "translateX(200px)" }}
        >
          <PixelFenceV height={90} />
        </div>

        {/* Trees */}
        {TREES.map((t, i) => (
          <div
            key={`tree-${i}`}
            className={`ranch-tree${t.size === "lg" ? " ranch-tree--large" : ""}`}
            style={{ left: t.left, top: t.top }}
          >
            <PixelTree size={t.size} />
          </div>
        ))}

        {/* Decorations */}
        {DECOS.map((d, i) => (
          <div key={`deco-${i}`} className="ranch-flower" style={{ left: d.left, top: d.top }}>
            <DecoItem type={d.type} />
          </div>
        ))}

        {/* Animals + bubbles */}
        <div className="ranch-animals">
          {animals.map((animal) => (
            <React.Fragment key={animal.id}>
              {bubbles.has(animal.id) && (
                <div
                  className="ranch-bubble"
                  style={{
                    position: "absolute",
                    left: (animal.style as Record<string, string>).left,
                    top: (animal.style as Record<string, string>).top,
                    transform: "translate(-50%, -100%)",
                    marginTop: -4,
                  }}
                >
                  {bubbles.get(animal.id)!.phrase}
                </div>
              )}
              <RanchAnimal animal={animal} onBubble={handleBubble} />
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Title（屏幕坐标固定：不随世界层缩放/平移） */}
      <div className="ranch-title">
        <div className="ranch-title__main">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ verticalAlign: "middle", marginRight: 4 }}
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          Agent 牧场
        </div>
        <div className="ranch-title__sub">{status}</div>
      </div>

      {/* Action buttons */}
      <div className="ranch-actions">
        <button
          className="ranch-btn ranch-btn--feed"
          onClick={() => agents.forEach((a) => triggerBubble(a.id, FEED_PHRASES))}
        >
          投喂
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            style={{ verticalAlign: "middle", marginLeft: 4 }}
          >
            <path
              d="M12 22V12M12 12C12 12 7 9 7 5a5 5 0 0 1 10 0c0 4-5 7-5 7Z"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          className="ranch-btn ranch-btn--whip"
          onClick={() => agents.forEach((a) => triggerBubble(a.id, WHIP_PHRASES))}
        >
          鞭策
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            style={{ verticalAlign: "middle", marginLeft: 4 }}
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />
          </svg>
        </button>
        {/* ── 昼夜循环：色调滤镜 + 牧场时钟 ── */}
        <div className="ranch-daycycle__tint" style={{ background: day.tint }} aria-hidden />
        <div className="ranch-daycycle__badge" aria-hidden>
          {day.label} · {day.clock}
        </div>
      </div>
    </div>
  );
}
