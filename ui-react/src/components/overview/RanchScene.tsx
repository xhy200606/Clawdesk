import React, { useState, Suspense } from "react";
import type { GatewayAgentRow, SessionActivityResult } from "../../lib/types.ts";
import { RanchScene2D } from "./RanchScene2D.tsx";

// Carga lazy del 3D para evitar importar three.js en el bundle principal
const RanchScene3DLazy = React.lazy(() =>
  import("./RanchScene3D.tsx").then((mod) => ({ default: mod.RanchScene3D })),
);

/**
 * Ranch scene wrapper con toggle 2D ↔ 3D.
 */
export type RanchSceneProps = {
  agents: GatewayAgentRow[];
  sessionActivity: SessionActivityResult | null;
};

export function RanchScene({ agents, sessionActivity }: RanchSceneProps) {
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [zoom2D, setZoom2D] = useState(1);

  return (
    <div className="ranch-wrapper">
      {/* Toggle 2D/3D */}
      <div className="ranch-view-toggle">
        {viewMode === "2d" && (
          <div className="ranch-zoom-controls" aria-label="2D 牧场缩放">
            <button
              type="button"
              title="缩小"
              onClick={() => setZoom2D((value) => Math.max(1, +(value - 0.1).toFixed(1)))}
            >
              −
            </button>
            <span>{Math.round(zoom2D * 100)}%</span>
            <button
              type="button"
              title="放大"
              onClick={() => setZoom2D((value) => Math.min(2.5, +(value + 0.1).toFixed(1)))}
            >
              +
            </button>
          </div>
        )}
        <button
          className={`ranch-view-toggle__btn ${viewMode === "2d" ? "ranch-view-toggle__btn--active" : ""}`}
          onClick={() => setViewMode("2d")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
          2D
        </button>
        <button
          className={`ranch-view-toggle__btn ${viewMode === "3d" ? "ranch-view-toggle__btn--active" : ""}`}
          onClick={() => setViewMode("3d")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          3D
        </button>
      </div>

      {viewMode === "2d" ? (
        <RanchScene2D
          agents={agents}
          sessionActivity={sessionActivity}
          zoom={zoom2D}
          onZoom={setZoom2D}
        />
      ) : (
        <Suspense
          fallback={
            <div className="ranch-scene ranch-scene--loading">
              <div className="ranch-loading-text">加载3D牧场中...</div>
            </div>
          }
        >
          <RanchScene3DLazy agents={agents} sessionActivity={sessionActivity} />
        </Suspense>
      )}
    </div>
  );
}
