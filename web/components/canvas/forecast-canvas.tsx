"use client";

/**
 * ForecastCanvas — trajectory mode: drag to draw a path, get back the polyline
 * in *outcome* coordinates. The curve-fit (path → per-checkpoint `(μ, σ)`) lives
 * in `web/lib/curve` and must match `kaido-math` (ADR-8); this component is just
 * the drawing surface + the screen↔domain mapping. Distribution mode (draw a
 * hump) is layered on the same primitive in Sprint 5.
 *
 * Pass `overlays` to render context behind the user's stroke (historical price,
 * the fitted curve preview, the consensus belief) — each as a polyline in the
 * same outcome coordinates.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import type { DrawnPoint } from "@/lib/curve";

export interface CanvasOverlay {
  points: DrawnPoint[];
  /** Stroke colour (any CSS colour). */
  color: string;
  /** Dashed if true. */
  dashed?: boolean;
  /** 0–1 opacity. */
  opacity?: number;
  label?: string;
}

export interface ForecastCanvasProps {
  /** Outcome-space bounds. `xMin` is the left edge (e.g. "now"), `xMax` the right (resolve). */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Pixel size of the drawing area. */
  width?: number;
  height?: number;
  /** Disable drawing (e.g. outside the draw phase). */
  disabled?: boolean;
  /** Context curves rendered behind the user's stroke. */
  overlays?: CanvasOverlay[];
  /** Vertical guide lines at these x values (checkpoints). */
  checkpointXs?: number[];
  /** Called whenever the drawn path changes (in outcome coords, sorted by x). */
  onPathChange?: (points: DrawnPoint[]) => void;
}

export function ForecastCanvas({
  xMin,
  xMax,
  yMin,
  yMax,
  width = 640,
  height = 320,
  disabled = false,
  overlays = [],
  checkpointXs = [],
  onPathChange,
}: ForecastCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [screenPts, setScreenPts] = useState<{ x: number; y: number }[]>([]);

  const toScreen = useCallback(
    (p: DrawnPoint) => ({
      x: ((p.x - xMin) / (xMax - xMin)) * width,
      y: height - ((p.y - yMin) / (yMax - yMin)) * height,
    }),
    [xMin, xMax, yMin, yMax, width, height],
  );

  const toDomain = useCallback(
    (sx: number, sy: number): DrawnPoint => ({
      x: xMin + (sx / width) * (xMax - xMin),
      y: yMin + ((height - sy) / height) * (yMax - yMin),
    }),
    [xMin, xMax, yMin, yMax, width, height],
  );

  const localPoint = useCallback((e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const sx = Math.max(0, Math.min(width, e.clientX - rect.left));
    const sy = Math.max(0, Math.min(height, e.clientY - rect.top));
    return { x: sx, y: sy };
  }, [width, height]);

  const emit = useCallback(
    (pts: { x: number; y: number }[]) => {
      const domain = pts
        .map((p) => toDomain(p.x, p.y))
        .sort((a, b) => a.x - b.x);
      onPathChange?.(domain);
    },
    [toDomain, onPathChange],
  );

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const p = localPoint(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrawing(true);
    setScreenPts([p]);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing || disabled) return;
    const p = localPoint(e);
    if (!p) return;
    setScreenPts((prev) => {
      const last = prev[prev.length - 1];
      // Throttle to ~3px to keep the polyline light.
      if (last && Math.hypot(p.x - last.x, p.y - last.y) < 3) return prev;
      const next = [...prev, p];
      return next;
    });
  };
  const onUp = () => {
    if (!drawing) return;
    setDrawing(false);
    emit(screenPts);
  };

  const overlayPaths = useMemo(
    () =>
      overlays.map((o) => ({
        ...o,
        d: o.points.length
          ? "M" + o.points.map(toScreen).map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")
          : "",
      })),
    [overlays, toScreen],
  );

  const userPath =
    screenPts.length > 1
      ? "M" + screenPts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")
      : "";

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      role="img"
      aria-label="Forecast drawing canvas"
      className={`touch-none rounded-lg border bg-card ${
        disabled ? "cursor-not-allowed opacity-90" : "cursor-crosshair"
      }`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      {/* faint horizontal grid */}
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={width}
          y1={height * f}
          y2={height * f}
          className="stroke-border"
          strokeWidth={1}
        />
      ))}
      {/* checkpoint guides */}
      {checkpointXs.map((cx, i) => {
        const x = ((cx - xMin) / (xMax - xMin)) * width;
        return (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={0}
            y2={height}
            className="stroke-muted-foreground/40"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
        );
      })}
      {/* context overlays */}
      {overlayPaths.map((o, i) =>
        o.d ? (
          <path
            key={i}
            d={o.d}
            fill="none"
            stroke={o.color}
            strokeWidth={2}
            strokeOpacity={o.opacity ?? 1}
            strokeDasharray={o.dashed ? "5 4" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null,
      )}
      {/* the user's stroke */}
      {userPath && (
        <path
          d={userPath}
          fill="none"
          className="stroke-primary"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
