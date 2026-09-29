import React from "react";
import { resolveAgentSpecies } from "../../lib/animals.ts";

export function AgentAppearance({
  emoji,
  image,
  className = "",
}: {
  emoji: string;
  image?: string | null;
  className?: string;
}) {
  return image ? (
    <img className={`agent-appearance ${className}`} src={image} alt={emoji} draggable={false} />
  ) : (
    <PixelAnimal emoji={emoji} className={className} />
  );
}

/**
 * 32x32 侧视像素动物——每种动物有独立剪影与识别特征：
 *  - 奶牛/黄牛：壮硕躯干+斑纹、下垂耳、双角、奶头 muzzle
 *  - 骏马：高腿、弧线脖颈、鬃毛、飘尾
 *  - 绵羊：蓬松羊毛团、深色脸与四腿
 *  - 山羊：山羊胡、后掠角、上翘短尾
 *  - 猪：圆滚粉身、朝天鼻、卷尾、前折耳
 *  - 狗：立耳、长吻、上扬尾
 *  - 猫：娇小、尖耳、长卷尾、背纹
 *  - 羊驼：直立长颈、香蕉耳、顶毛、彩毯
 *  - 小鹿：纤细、分叉鹿角、梅花斑点
 * 像素画均朝左，shapeRendering=crispEdges 保持硬边。
 */

const DARK = "#2b2724"; // 眼睛
const HOOF = "#4a4038"; // 蹄
const HORN = "#d9bd8e"; // 角

type Rect = [number, number, number, number, string];

function rects(cls: string, list: Rect[]) {
  return list.map(([x, y, w, h, fill], i) => (
    <rect key={`${cls}-${i}`} x={x} y={y} width={w} height={h} fill={fill} />
  ));
}

/** 四足 + 蹄的通用腿部 */
function legs(body: string, l: [number, number][], h = 5): React.ReactNode[] {
  return l.map(([x, y], i) => (
    <React.Fragment key={`leg-${i}`}>
      <rect x={x} y={y} width={3} height={h} fill={body} />
      <rect x={x} y={y + h} width={3} height={2} fill={HOOF} />
    </React.Fragment>
  ));
}

function PixelAnimal({ emoji, className }: { emoji: string; className: string }) {
  const animal = resolveAgentSpecies(emoji, 0);
  const { kind, body, marking, muzzle } = animal;
  const B = body;
  const M = marking;

  let art: React.ReactNode = null;

  if (kind === "cow") {
    art = (
      <>
        {legs(B, [
          [8, 22],
          [20, 22],
        ])}
        {/* 躯干 + 胸腹 */}
        <rect x="6" y="13" width="19" height="10" fill={B} />
        <rect x="7" y="20" width="17" height="3" fill={M} opacity="0.25" />
        {/* 斑纹（黄牛斑纹淡化为肤纹） */}
        {kind === "cow" ? (
          <>
            <rect x="10" y="15" width="5" height="4" fill={M} />
            <rect x="18" y="17" width="4" height="4" fill={M} />
            <rect x="14" y="13" width="3" height="2" fill={M} />
          </>
        ) : (
          <rect x="9" y="14" width="4" height="2" fill={M} opacity="0.5" />
        )}
        {/* 头（低于背线，典型牛头） */}
        <rect x="1" y="11" width="9" height="8" fill={B} />
        <rect x="1" y="16" width="5" height="3" fill={muzzle} />
        <rect x="2" y="17" width="1" height="1" fill={DARK} />
        <rect x="4" y="17" width="1" height="1" fill={DARK} />
        {/* 角 + 耳 */}
        <rect x="2" y="8" width="2" height="3" fill={HORN} />
        <rect x="7" y="8" width="2" height="3" fill={HORN} />
        <rect x="9" y="12" width="2" height="3" fill={M} />
        <rect x="5" y="13" width="2" height="2" fill={DARK} />
        {/* 尾 */}
        <rect x="24" y="13" width="1" height="7" fill={M} />
        <rect x="23" y="19" width="2" height="2" fill={M} />
      </>
    );
  } else if (kind === "horse") {
    art = (
      <>
        {legs(
          B,
          [
            [8, 21],
            [20, 21],
          ],
          6,
        )}
        {/* 躯干 */}
        <rect x="6" y="13" width="19" height="9" fill={B} />
        <rect x="6" y="19" width="19" height="3" fill={M} opacity="0.18" />
        {/* 脖颈（斜向上）+ 头 */}
        <rect x="3" y="7" width="5" height="9" fill={B} />
        <rect x="1" y="4" width="8" height="5" fill={B} />
        <rect x="1" y="7" width="4" height="2" fill={muzzle} />
        <rect x="2" y="7" width="1" height="1" fill={DARK} />
        {/* 鬃毛（沿颈背到额发） */}
        <rect x="8" y="4" width="2" height="10" fill={M} />
        <rect x="2" y="3" width="6" height="1" fill={M} />
        <rect x="9" y="6" width="2" height="2" fill={M} />
        <rect x="4" y="5" width="2" height="2" fill={DARK} />
        {/* 飘尾 */}
        <rect x="24" y="12" width="2" height="10" fill={M} />
        <rect x="25" y="20" width="2" height="3" fill={M} />
      </>
    );
  } else if (kind === "sheep") {
    art = (
      <>
        {legs(
          M,
          [
            [10, 23],
            [19, 23],
          ],
          4,
        )}
        {/* 蓬松羊毛躯干（外圈羊毛色，内里体色） */}
        <rect x="6" y="12" width="20" height="12" rx="1" fill={M} />
        <rect x="8" y="14" width="16" height="8" fill={B} />
        {/* 羊毛团块 */}
        <rect x="4" y="14" width="4" height="5" fill={M} />
        <rect x="7" y="10" width="6" height="3" fill={M} />
        <rect x="14" y="9" width="7" height="4" fill={M} />
        <rect x="21" y="11" width="4" height="3" fill={M} />
        <rect x="23" y="15" width="3" height="6" fill={M} />
        {/* 深色羊脸 */}
        <rect x="1" y="12" width="6" height="7" fill={M} />
        <rect x="0" y="16" width="2" height="3" fill="#8a7666" />
        <rect x="6" y="11" width="2" height="2" fill={M} />
        <rect x="4" y="14" width="1" height="1" fill="#1f1b18" />
        {/* 小尾巴 */}
        <rect x="24" y="12" width="2" height="2" fill={M} />
      </>
    );
  } else if (kind === "goat") {
    art = (
      <>
        {legs(B, [
          [9, 22],
          [18, 22],
        ])}
        <rect x="6" y="13" width="18" height="10" fill={B} />
        {/* 头 + 胡须 */}
        <rect x="1" y="10" width="8" height="7" fill={B} />
        <rect x="1" y="14" width="4" height="3" fill={muzzle} />
        <rect x="3" y="17" width="2" height="4" fill={M} />
        <rect x="8" y="12" width="3" height="2" fill={M} />
        {/* 后掠角 */}
        <rect x="2" y="7" width="2" height="4" fill={HORN} />
        <rect x="6" y="7" width="2" height="4" fill={HORN} />
        <rect x="3" y="6" width="4" height="1" fill={HORN} />
        <rect x="4" y="12" width="2" height="2" fill={DARK} />
        {/* 上翘短尾 */}
        <rect x="23" y="11" width="2" height="3" fill={M} />
      </>
    );
  } else if (kind === "pig") {
    art = (
      <>
        {legs(
          M,
          [
            [9, 23],
            [18, 23],
          ],
          4,
        )}
        {/* 圆滚躯干 */}
        <rect x="6" y="13" width="18" height="11" fill={B} />
        <rect x="8" y="21" width="14" height="3" fill={M} opacity="0.3" />
        {/* 头 + 朝天鼻 */}
        <rect x="1" y="12" width="8" height="9" fill={B} />
        <rect x="0" y="16" width="3" height="4" fill={muzzle} />
        <rect x="1" y="17" width="1" height="2" fill={M} />
        {/* 前折耳 */}
        <rect x="7" y="10" width="3" height="4" fill={M} />
        <rect x="5" y="14" width="2" height="2" fill={DARK} />
        {/* 卷尾 */}
        <rect x="24" y="14" width="2" height="1" fill={M} />
        <rect x="25" y="12" width="1" height="3" fill={M} />
        <rect x="26" y="13" width="1" height="1" fill={M} />
      </>
    );
  } else if (kind === "dog") {
    art = (
      <>
        {legs(B, [
          [9, 22],
          [18, 22],
        ])}
        <rect x="6" y="14" width="17" height="9" fill={B} />
        {/* 胸口浅色 */}
        <rect x="7" y="19" width="4" height="4" fill={muzzle} opacity="0.6" />
        {/* 头 + 长吻 */}
        <rect x="1" y="10" width="9" height="8" fill={B} />
        <rect x="0" y="14" width="3" height="3" fill={muzzle} />
        <rect x="0" y="14" width="1" height="1" fill={DARK} />
        {/* 立耳 */}
        <rect x="2" y="6" width="2" height="5" fill={M} />
        <rect x="6" y="6" width="2" height="5" fill={M} />
        <rect x="4" y="12" width="2" height="2" fill={DARK} />
        {/* 上扬尾 */}
        <rect x="23" y="13" width="2" height="2" fill={B} />
        <rect x="24" y="10" width="2" height="4" fill={M} />
      </>
    );
  } else if (kind === "cat") {
    art = (
      <>
        {legs(
          B,
          [
            [10, 23],
            [18, 23],
          ],
          4,
        )}
        {/* 娇小躯干 */}
        <rect x="7" y="17" width="15" height="7" fill={B} />
        {/* 背纹 */}
        <rect x="11" y="17" width="1" height="5" fill={M} opacity="0.7" />
        <rect x="14" y="17" width="1" height="5" fill={M} opacity="0.7" />
        <rect x="17" y="17" width="1" height="5" fill={M} opacity="0.7" />
        {/* 头 + 尖耳（内耳粉色） */}
        <rect x="2" y="12" width="8" height="7" fill={B} />
        <rect x="2" y="9" width="2" height="4" fill={B} />
        <rect x="7" y="9" width="2" height="4" fill={B} />
        <rect x="2" y="10" width="1" height="2" fill={muzzle} />
        <rect x="8" y="10" width="1" height="2" fill={muzzle} />
        <rect x="1" y="16" width="2" height="1" fill={muzzle} />
        <rect x="4" y="14" width="2" height="2" fill={DARK} />
        {/* 长卷尾 */}
        <rect x="21" y="18" width="4" height="1" fill={B} />
        <rect x="24" y="14" width="1" height="5" fill={B} />
        <rect x="23" y="13" width="2" height="2" fill={M} />
      </>
    );
  } else if (kind === "llama") {
    art = (
      <>
        {legs(B, [
          [9, 22],
          [19, 22],
        ])}
        {/* 躯干 + 彩毯 */}
        <rect x="6" y="14" width="18" height="9" fill={B} />
        <rect x="12" y="15" width="8" height="6" fill={M} opacity="0.55" />
        {/* 直立长颈 */}
        <rect x="4" y="4" width="5" height="12" fill={B} />
        <rect x="2" y="1" width="8" height="5" fill={B} />
        {/* 香蕉耳 + 顶毛 */}
        <rect x="3" y="-1" width="2" height="3" fill={B} />
        <rect x="7" y="-1" width="2" height="3" fill={B} />
        <rect x="4" y="0" width="5" height="2" fill={M} />
        <rect x="1" y="4" width="2" height="2" fill={muzzle} />
        <rect x="4" y="2" width="2" height="2" fill={DARK} />
        {/* 短尾 */}
        <rect x="23" y="13" width="2" height="3" fill={M} />
      </>
    );
  } else {
    // deer：纤细身形 + 分叉鹿角 + 梅花点
    art = (
      <>
        {legs(B, [
          [9, 22],
          [18, 22],
        ])}
        <rect x="6" y="14" width="17" height="8" fill={B} />
        {/* 颈 + 头 */}
        <rect x="3" y="9" width="5" height="7" fill={B} />
        <rect x="1" y="7" width="8" height="4" fill={B} />
        <rect x="0" y="9" width="2" height="2" fill={muzzle} />
        {/* 分叉鹿角 */}
        <rect x="2" y="2" width="1" height="5" fill={HORN} />
        <rect x="0" y="3" width="3" height="1" fill={HORN} />
        <rect x="6" y="2" width="1" height="5" fill={HORN} />
        <rect x="5" y="4" width="3" height="1" fill={HORN} />
        <rect x="7" y="0" width="2" height="3" fill={HORN} />
        <rect x="8" y="8" width="2" height="2" fill={B} />
        <rect x="4" y="8" width="2" height="2" fill={DARK} />
        {/* 梅花斑点 */}
        <rect x="10" y="16" width="1" height="1" fill={M} />
        <rect x="13" y="15" width="1" height="1" fill={M} />
        <rect x="16" y="17" width="1" height="1" fill={M} />
        <rect x="12" y="18" width="1" height="1" fill={M} />
        {/* 短尾 */}
        <rect x="23" y="13" width="2" height="2" fill={M} />
      </>
    );
  }

  return (
    <svg
      className={`agent-appearance ranch-pixel-animal ${className}`}
      viewBox="0 0 32 32"
      role="img"
      aria-label={animal.label}
      shapeRendering="crispEdges"
    >
      <ellipse cx="16" cy="30" rx="11" ry="1.6" fill="#263324" opacity=".2" />
      {art}
    </svg>
  );
}
