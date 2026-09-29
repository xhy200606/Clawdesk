/**
 * 真实月相 —— 按当前日期计算月相周期，2D/3D 共用。
 *
 * 算法：以 2000-01-06 18:14 UTC（已知新月）为基准，朔望月 29.530588853 天。
 * phase 0..1：0 新月 → 0.25 上弦 → 0.5 满月 → 0.75 下弦 → 1 新月。
 * illum：被照亮面积比例（照度）。
 */

const SYNODIC = 29.530588853;
/** 参考新月：2000-01-06T18:14:00Z */
const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14, 0);

export type MoonPhaseInfo = {
  /** 月龄（天） */
  age: number;
  /** 相位 0..1（0=新月，0.5=满月） */
  phase: number;
  /** 照度 0..1（被照亮面积比例） */
  illum: number;
  /** 盈月（上半个周期，亮面在右） */
  waxing: boolean;
  /** 中文名：新月/娥眉月/上弦月/盈凸月/满月/亏凸月/下弦月/残月 */
  label: string;
};

export function computeMoonPhase(now: Date = new Date()): MoonPhaseInfo {
  const days = (now.getTime() - REF_NEW_MOON) / 86400000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  const illum = (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const waxing = phase < 0.5;
  return { age, phase, illum, waxing, label: phaseLabel(phase) };
}

export function phaseLabel(phase: number): string {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.03 || p >= 0.97) return "新月";
  if (p < 0.22) return "娥眉月";
  if (p < 0.28) return "上弦月";
  if (p < 0.47) return "盈凸月";
  if (p < 0.53) return "满月";
  if (p < 0.72) return "亏凸月";
  if (p < 0.78) return "下弦月";
  return "残月";
}

/**
 * 月面亮区 SVG path（2D 用）。
 * phase 0..1；r 半径；(cx,cy) 圆心。亮面：盈月朝右、亏月朝左（北半球惯例）。
 * 亮区 = 亮侧半圆 + 明暗界线（椭圆弧，rx = |cos(2πphase)|·r）。
 */
export function moonLitPath(phase: number, r: number, cx: number, cy: number): string {
  const k = Math.cos(2 * Math.PI * phase); // 1 新月 … -1 满月
  const litRight = phase < 0.5;
  const rx = Math.abs(k) * r;
  const top = `${cx} ${cy - r}`;
  const bot = `${cx} ${cy + r}`;
  if (Math.abs(k) < 0.02) {
    if (phase >= 0.48 && phase <= 0.52) {
      // 满月：整圆亮
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
    }
    // 近似半弦月
    return `M ${top} A ${r} ${r} 0 0 ${litRight ? 1 : 0} ${bot} Z`;
  }
  // 半圆（亮侧）+ 界线椭圆弧（鼓向：盈凸/亏凸朝暗侧，娥眉/残月朝亮侧）
  const sweepHalf = litRight ? 1 : 0;
  // 底→顶：sweep=1 经左侧，sweep=0 经右侧
  const sweepTerm = litRight ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0;
  return `M ${top} A ${r} ${r} 0 0 ${sweepHalf} ${bot} A ${rx} ${r} 0 0 ${sweepTerm} ${top} Z`;
}

/** 满月判定（用于 3D 兜底整圆渲染） */
export function isFullMoon(phase: number): boolean {
  return Math.abs(phase - 0.5) < 0.02;
}

/**
 * 月面绘制（Canvas 2D，3D 天球公告板纹理用）。
 * 亮面：盈月朝右、亏月朝左；界线椭圆 rx = |cos(2πphase)|·r。
 */
export function drawMoonCanvas(ctx: CanvasRenderingContext2D, size: number, phase: number): void {
  const c = size / 2;
  const r = size * 0.38;
  ctx.clearRect(0, 0, size, size);
  // 暗面底盘
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = "#39415c";
  ctx.fill();
  // 亮区
  const k = Math.cos(2 * Math.PI * phase);
  const litRight = phase < 0.5;
  ctx.beginPath();
  ctx.arc(c, c, r, -Math.PI / 2, Math.PI / 2, !litRight);
  ctx.ellipse(c, c, r * Math.abs(k), r, 0, Math.PI / 2, -Math.PI / 2, litRight ? k > 0 : k < 0);
  ctx.fillStyle = "#eef2fb";
  ctx.fill();
}
