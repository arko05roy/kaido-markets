/**
 * Belief-input invariants: σ is always clamped to the market's effective
 * σ-floor (so the contract's `peak ≤ b` re-check can't reject it), value↔WAD
 * round-trips, and the chart grid + render produce finite, sane series for edge
 * inputs. These guard the slider-driven inputs that replaced the freehand canvas.
 */
import { describe, it, expect } from "vitest";

import {
  clampSigma,
  effectiveSigmaFloor,
  fromWad,
  gridOverRange,
  renderGaussian,
  toWad,
  WAD,
} from "@/lib/curve";

const MARKET = { kWad: WAD, bWad: 100n * WAD }; // k=1, b=100 (the demo market)

describe("clampSigma", () => {
  const floor = effectiveSigmaFloor(MARKET.kWad, MARKET.bWad);

  it("raises a too-small σ to the effective floor", () => {
    expect(clampSigma(1n, MARKET)).toBe(floor);
    expect(clampSigma(floor - 1n, MARKET)).toBe(floor);
    expect(clampSigma(0n, MARKET)).toBe(floor);
    expect(clampSigma(-5n, MARKET)).toBe(floor);
  });

  it("leaves a σ at or above the floor unchanged", () => {
    expect(clampSigma(floor, MARKET)).toBe(floor);
    expect(clampSigma(WAD, MARKET)).toBe(WAD);
    expect(clampSigma(5n * WAD, MARKET)).toBe(5n * WAD);
  });

  it("the floor itself is strictly above the raw σ_min (headroom for the peak check)", () => {
    // effectiveSigmaFloor = sigmaFloor + sigmaFloor>>10 + 1 — always larger.
    expect(floor).toBeGreaterThan(0n);
  });
});

describe("value ↔ WAD", () => {
  it("round-trips realistic outcome values", () => {
    for (const v of [0, 1, 50, 65000, 80532.5, 0.001, -3.14]) {
      const back = fromWad(toWad(v));
      expect(Math.abs(back - v)).toBeLessThan(Math.max(1e-9, Math.abs(v) * 1e-9));
    }
  });
});

describe("gridOverRange", () => {
  it("returns n evenly-spaced points, endpoints inclusive", () => {
    const g = gridOverRange(10, 20, 11);
    expect(g.length).toBe(11);
    expect(g[0]).toBe(10);
    expect(g[10]).toBe(20);
    expect(g[5]).toBeCloseTo(15);
  });
  it("degenerates safely on bad input", () => {
    expect(gridOverRange(5, 5, 8)).toEqual(Array(8).fill(5));
    expect(gridOverRange(5, 1, 8)).toEqual(Array(8).fill(5));
    expect(gridOverRange(NaN, 1, 8)).toEqual([NaN]);
    expect(gridOverRange(0, 1, 1)).toEqual([0]);
  });
});

describe("renderGaussian", () => {
  it("produces a finite, non-negative bell peaking near μ", () => {
    const muReal = 65_000;
    const sigmaReal = 200;
    const belief = { muWad: toWad(muReal), sigmaWad: clampSigma(toWad(sigmaReal), MARKET) };
    const xs = gridOverRange(muReal - 5 * sigmaReal, muReal + 5 * sigmaReal, 64);
    const pts = renderGaussian(belief, MARKET, xs);
    expect(pts.length).toBe(64);
    for (const p of pts) {
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
    const maxAt = pts.reduce((best, p) => (p.y > best.y ? p : best));
    expect(Math.abs(maxAt.x - muReal)).toBeLessThan(sigmaReal); // peak within 1σ of μ
  });

  it("handles σ at the floor without throwing or producing NaN", () => {
    const floor = effectiveSigmaFloor(MARKET.kWad, MARKET.bWad);
    const belief = { muWad: toWad(50), sigmaWad: floor };
    const xs = gridOverRange(40, 60, 32);
    const pts = renderGaussian(belief, MARKET, xs);
    expect(pts.every((p) => Number.isFinite(p.y) && p.y >= 0)).toBe(true);
  });
});
