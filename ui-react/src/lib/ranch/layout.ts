/**
 * 牧场统一布局（2D / 3D 单一事实源）
 *
 * 坐标体系：世界百分比 —— x 0..100（左→右），y 0..100（上→下）。
 * - 2D：世界世界层用百分比定位；河道 SVG（viewBox 320×700，铺 32%×70%）
 *   恰好 1 viewBox 单位 = 0.1% 世界 → v2d(x)=x*10。
 * - 3D：地面 20×20，w3d: X=(x-50)/5, Z=(y-50)/5（45%→-1, 55%→1）。
 *
 * 所有跨 2D/3D 的静态元素（路 / 河 / 桥 / 建筑 / 围栏 / 树）一律从这里取值，
 * 保证两端布局完全一致。
 */

// ── 坐标变换 ─────────────────────────────────────────────────────
/** 世界% → 2D 河道 SVG viewBox（0 0 320 700，铺满世界左上 32%×70% 区域） */
export const v2d = (x: number, y: number): [number, number] => [x * 10, y * 10];
/** 世界% → 3D 地面坐标（x→X，y→Z） */
export const w3d = (x: number, y: number): [number, number] => [(x - 50) / 5, (y - 50) / 5];

// ── 道路 ─────────────────────────────────────────────────────────
export const ROADS = {
  /** 横路 y（全宽贯穿） */
  hY: 55,
  /** 竖路一 x（全高贯穿） */
  v1X: 45,
  /** 竖路二 x（南段：y 44→100，北端为入户路汇入点） */
  v2X: 20,
} as const;

// ── 河道（世界% 采样点，自北缘流向西南池塘） ─────────────────────
export const RIVER_PTS: Array<[number, number]> = [
  [22.5, 0],
  [20, 4],
  [17.5, 11],
  [15, 16],
  [12.5, 21],
  [11, 26],
  [9.8, 32],
  [8.6, 38],
  [7.9, 44],
  [7.4, 49],
  // 直线段：垂直下穿横路（y=55 桥位），桥架在正交交叉点上
  [7.4, 60],
  [7.6, 63],
  [8.6, 66],
  [10, 67.6],
  [11.2, 68.9],
];

/** 河道半宽（世界%） */
export const RIVER_HALF_W = 1.8;

/** 河在指定 y 处的中心 x（线性插值） */
export function riverXAt(y: number): number {
  const pts = RIVER_PTS;
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    if (y <= pts[i][1]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0 || 1);
    }
  }
  return pts[pts.length - 1][0];
}

/** 点在河的哪一侧："W" 西岸 / "E" 东岸（留出河道半宽 + 0.4 缓冲） */
export function sideOf(x: number, y: number): "W" | "E" {
  return x < riverXAt(y) - RIVER_HALF_W - 0.4 ? "W" : "E";
}

// ── 桥（唯一河×路交叉点：横路 y=55 ∩ 河） ────────────────────────
export const BRIDGE = { x: 7.4, y: 55 } as const;

// ── 建筑 / 池塘（2D div 左上角 + 像素尺寸 → 3D 用中心点） ─────────
/** 参考场景尺寸（px），用于把 px 偏移折算成世界% */
export const SCENE_REF = { w: 692, h: 491 } as const;

export const BARN = {
  /** 2D div 左上角（%）—— 移出河道（河上段斜穿 12~21%，26 起为东岸安全区） */
  left: 26,
  top: 8,
  /** PixelBarn 像素尺寸 */
  pxW: 64,
  pxH: 56,
} as const;
export const barnCenter = (): [number, number] => [
  BARN.left + (BARN.pxW / 2 / SCENE_REF.w) * 100,
  BARN.top + (BARN.pxH / 2 / SCENE_REF.h) * 100,
];
/** 谷仓门口（正下方） */
export const barnDoor = (): [number, number] => [
  barnCenter()[0],
  BARN.top + (BARN.pxH / SCENE_REF.h) * 100,
];

export const HOUSES = [
  { left: 28, top: 40, roof: "#7a9e4e" },
  { left: 28, top: 68, roof: "#c87848" },
  { left: 72, top: 65, roof: "#6a9898" },
] as const;
export const HOUSE_PX = { w: 40, h: 40 } as const;
export const houseCenter = (h: { left: number; top: number }): [number, number] => [
  h.left + (HOUSE_PX.w / 2 / SCENE_REF.w) * 100,
  h.top + (HOUSE_PX.h / 2 / SCENE_REF.h) * 100,
];

/** 池塘中心（2D div 左上 (6,64)，72×48px） */
export const POND_CENTER: [number, number] = [
  6 + (36 / SCENE_REF.w) * 100,
  64 + (24 / SCENE_REF.h) * 100,
];

/** 入户路：谷仓门口 → 竖路二（V2）顶端的土路（2D/3D 共用折线，世界%） */
export const HOUSE_PATH_PTS: Array<[number, number]> = [
  [30.6, 19.4],
  [29.2, 25],
  [26.5, 31.5],
  [23, 36],
  [20, 42],
  [20, 45],
];

// ── 围栏圈（2D：px 尺寸；3D：按参考场景折算世界%） ────────────────
export const PEN = {
  /** 左上角（世界%） */
  left: 52,
  top: 18,
  /** 2D 像素尺寸 */
  pxW: 200,
  pxH: 90,
} as const;
export const penRect = () => ({
  x0: PEN.left,
  y0: PEN.top,
  x1: PEN.left + (PEN.pxW / SCENE_REF.w) * 100,
  y1: PEN.top + (PEN.pxH / SCENE_REF.h) * 100,
});
export const penCenter = (): [number, number] => {
  const r = penRect();
  return [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2];
};
/** 圈门中心（南边栏中部，2D gate 在 x+80~112px 处） */
export const penGate = (): [number, number] => [
  PEN.left + ((80 + 112) / 2 / SCENE_REF.w) * 100,
  PEN.top + (PEN.pxH / SCENE_REF.h) * 100,
];

// ── 工作槽位（与 2D ZONES 同源；3D 由 w3d 派生） ──────────────────
export const ZONES: Record<string, { left: number; top: number; label: string }> = {
  thinking: { left: 27, top: 21, label: "谷仓前" },
  tool_calling: { left: 82, top: 10, label: "风车旁" },
  speaking: { left: 42, top: 50, label: "告示牌" },
  idle: { left: 58, top: 28, label: "池塘边" },
  error: { left: 30, top: 68, label: "原地" },
  spawning: { left: 32, top: 21, label: "谷仓门口" },
};

// ── 路网（寻路用路标图） ─────────────────────────────────────────
export type WayNode = { id: string; x: number; y: number };
export const WAY_NODES: WayNode[] = [
  { id: "gate", x: 0, y: 0 }, // 占位，运行时由 penGate() 填充
  { id: "hV1", x: 45, y: 55 },
  { id: "hV2", x: 20, y: 55 },
  { id: "bridgeE", x: 9.9, y: 55 },
  { id: "bridgeW", x: 4.9, y: 55 },
  { id: "meadow", x: 3.5, y: 42 },
  { id: "v2s", x: 20, y: 72 },
  { id: "v1s", x: 45, y: 72 },
];
/** 实际节点坐标（gate 用运行时 penGate） */
export function wayNodePos(n: WayNode): [number, number] {
  if (n.id === "gate") return penGate();
  return [n.x, n.y];
}
const WAY_EDGES: Array<[string, string]> = [
  ["gate", "hV1"],
  ["gate", "hV2"],
  ["hV1", "hV2"],
  ["hV2", "bridgeE"],
  ["bridgeE", "bridgeW"], // 桥
  ["bridgeW", "meadow"], // 沿河路（西岸）
  ["hV1", "v1s"],
  ["hV2", "v2s"],
];

/** BFS 最短路（节点数少，直接搜） */
function bfs(from: string, to: string): string[] | null {
  const adj = new Map<string, string[]>();
  for (const [a, b] of WAY_EDGES) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const nxt of adj.get(cur) ?? []) {
      if (!prev.has(nxt)) {
        prev.set(nxt, cur);
        queue.push(nxt);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: string[] = [];
  let cur: string | null = to;
  while (cur) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path;
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** 离点最近的路标节点 */
function nearestNode(x: number, y: number): WayNode {
  let best = WAY_NODES[0];
  let bd = Infinity;
  for (const n of WAY_NODES) {
    const d = dist(wayNodePos(n), [x, y]);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

/**
 * 跨区域路线（世界% 折线，不含起点、不含终点；空数组 = 可直达）。
 * 规则：同侧（河同岸）且直线不穿河 → 直达；否则沿路网走（唯一过河点=桥）。
 */
export function routeBetween(
  from: [number, number],
  to: [number, number],
  opts?: { forceRoads?: boolean },
): Array<[number, number]> {
  const sf = sideOf(from[0], from[1]);
  const st = sideOf(to[0], to[1]);
  if (!opts?.forceRoads) {
    if (sf === st && sf === "E") return []; // 东岸无河，直达
    if (sf === st && sf === "W") return []; // 西岸内部直达
  } else if (sf === st && dist(from, to) < 14) {
    return []; // 强制走路网但目标很近，直达即可
  }
  // 跨河：沿路网（桥是唯一通道）
  const nf = nearestNode(from[0], from[1]);
  const nt = nearestNode(to[0], to[1]);
  const ids = bfs(nf.id, nt.id);
  if (!ids) return [];
  const pts: Array<[number, number]> = [];
  // 起点→最近节点：若最近节点与起点异侧，改用起点侧的桥端节点
  const startSideOk = sideOf(...wayNodePos(nf)) === sf;
  const fromNode = startSideOk
    ? nf
    : WAY_NODES.find((n) => n.id === (sf === "W" ? "bridgeW" : "bridgeE"))!;
  if (!startSideOk) {
    const retry = bfs(fromNode.id, nt.id);
    if (!retry) return [];
    for (const id of retry.slice(1)) {
      const n = WAY_NODES.find((w) => w.id === id)!;
      pts.push(wayNodePos(n));
    }
    return pts;
  }
  for (const id of ids.slice(1)) {
    const n = WAY_NODES.find((w) => w.id === id)!;
    pts.push(wayNodePos(n));
  }
  return pts;
}

/**
 * 闲逛远足点（空闲牛马偶尔出圈遛弯的目的地）：
 * 西岸草沿 / 桥头 / 路口 —— 强制经过 沿河路 与 桥。
 */
export const EXCURSIONS: Array<[number, number]> = [
  [3.5, 44], // 西岸草沿
  [5, 60], // 桥头南侧
  [20, 66], // V2 路口南
  [45, 64], // V1 路口南
  [9.9, 50], // 桥东引道
];
