"use client";

import { useMemo } from "react";

import { gridOverRange, renderGaussian } from "@/lib/curve";

/**
 * Real mini belief curve for market cards — renders actual crowd μ/σ, not a
 * decorative placeholder.
 */
export function MiniCrowdCurve({
  muWad,
  sigmaWad,
  kWad,
  bWad,
  capped,
  className = "",
}: {
  muWad: bigint;
  sigmaWad: bigint;
  kWad: bigint;
  bWad: bigint;
  capped?: boolean;
  className?: string;
}) {
  const path = useMemo(() => {
    const belief = { muWad, sigmaWad };
    const market = { kWad, bWad, capped };
    const mu = Number(muWad) / 1e18;
    const sigma = Math.max(1e-12, Number(sigmaWad) / 1e18);
    const xs = gridOverRange(mu - 3 * sigma, mu + 3 * sigma, 32);
    const pts = renderGaussian(belief, market, xs);
    if (pts.length < 2) return null;
    const maxY = Math.max(...pts.map((p) => p.y), 1e-9);
    const w = 120;
    const h = 40;
    const xMin = xs[0]!;
    const xMax = xs[xs.length - 1]!;
    const xSpan = Math.max(xMax - xMin, 1e-9);
    const coords = pts.map((p) => {
      const px = ((p.x - xMin) / xSpan) * w;
      const py = h - (p.y / maxY) * (h - 4) - 2;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    const muPx = ((mu - xMin) / xSpan) * w;
    return { line: coords.join(" "), muPx, w, h };
  }, [muWad, sigmaWad, kWad, bWad, capped]);

  if (!path) {
    return (
      <svg viewBox="0 0 120 40" className={`block h-10 w-[7.5rem] opacity-40 ${className}`} aria-hidden>
        <line x1="4" y1="36" x2="116" y2="36" stroke="rgba(255,255,255,0.15)" />
      </svg>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${path.w} ${path.h}`}
      className={`block h-10 w-[7.5rem] shrink-0 opacity-80 transition-opacity group-hover:opacity-100 ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="miniCrowdFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#d8c69a" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#d8c69a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={path.line}
        fill="none"
        stroke="#d8c69a"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points={`4,${path.h - 2} ${path.line} ${path.w - 4},${path.h - 2}`} fill="url(#miniCrowdFill)" />
      <line
        x1={path.muPx}
        y1="4"
        x2={path.muPx}
        y2={path.h - 2}
        stroke="rgba(216,198,154,0.4)"
        strokeDasharray="2 3"
      />
    </svg>
  );
}
