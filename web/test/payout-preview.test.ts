import { describe, expect, it } from "vitest";

import { toWad } from "@/lib/curve";
import { estimatePayoutPreview } from "@/lib/market-display";

describe("estimatePayoutPreview", () => {
  const crowd = { muWad: toWad(50), sigmaWad: toWad(10) };
  const faded = { muWad: toWad(70), sigmaWad: toWad(10) };

  it("scales with risk when pool is deep enough", () => {
    const market = { kWad: toWad(1), bWad: toWad(10_000), capped: false };
    const small = estimatePayoutPreview({
      riskUsdc: 20,
      yourBelief: faded,
      crowdBelief: crowd,
      market,
    });
    const large = estimatePayoutPreview({
      riskUsdc: 100,
      yourBelief: faded,
      crowdBelief: crowd,
      market,
    });
    expect(large.maxWin).toBeGreaterThan(small.maxWin);
  });

  it("reacts when call (mu) moves away from crowd", () => {
    const market = { kWad: toWad(1), bWad: toWad(10_000), capped: false };
    const aligned = estimatePayoutPreview({
      riskUsdc: 25,
      yourBelief: crowd,
      crowdBelief: crowd,
      market,
    });
    const offCrowd = estimatePayoutPreview({
      riskUsdc: 25,
      yourBelief: faded,
      crowdBelief: crowd,
      market,
    });
    expect(offCrowd.maxWin).toBeGreaterThan(aligned.maxWin);
  });

  it("reacts when conviction (sigma) tightens", () => {
    const market = { kWad: toWad(1), bWad: toWad(10_000), capped: false };
    const wide = estimatePayoutPreview({
      riskUsdc: 25,
      yourBelief: crowd,
      crowdBelief: crowd,
      market,
    });
    const sniper = estimatePayoutPreview({
      riskUsdc: 25,
      yourBelief: { muWad: toWad(50), sigmaWad: toWad(2) },
      crowdBelief: crowd,
      market,
    });
    expect(sniper.maxWin).toBeGreaterThan(wide.maxWin);
  });

  it("does not print fantasy multiples when fading hard", () => {
    const market = { kWad: toWad(1), bWad: toWad(1), capped: false };
    const extreme = estimatePayoutPreview({
      riskUsdc: 10,
      yourBelief: { muWad: toWad(99), sigmaWad: toWad(0.5) },
      crowdBelief: crowd,
      market,
    });
    expect(extreme.multiple).toBeLessThanOrEqual(25);
    expect(extreme.maxWin).toBeLessThanOrEqual(250);
    expect(extreme.maxWin).toBeGreaterThan(0);
  });

  it("scales with risk on small pools instead of pinning at b×0.85", () => {
    const market = { kWad: toWad(1), bWad: toWad(1), capped: false };
    const at20 = estimatePayoutPreview({
      riskUsdc: 20,
      yourBelief: faded,
      crowdBelief: crowd,
      market,
    });
    const at100 = estimatePayoutPreview({
      riskUsdc: 100,
      yourBelief: faded,
      crowdBelief: crowd,
      market,
    });
    expect(at100.maxWin).toBeGreaterThan(at20.maxWin);
    expect(at20.maxWin).not.toBe(0.85);
  });
});
