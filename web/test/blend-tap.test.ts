import { describe, expect, it } from "vitest";

import {
  BLEND_BORROW_DEN,
  BLEND_BORROW_NUM,
  computeBlendTapBreakdown,
  displayBlendTapBreakdown,
  usdc7dpFromFloat,
} from "@/lib/blend-tap";

describe("computeBlendTapBreakdown", () => {
  it("borrows half of collateral at 1% fee", () => {
    const total = usdc7dpFromFloat(25);
    const b = computeBlendTapBreakdown({
      maxTotal7dp: total,
      feeBps: 100,
      availableDepth7dp: usdc7dpFromFloat(10_000),
    });
    expect(b.fee7dp).toBeGreaterThan(0n);
    expect(b.collateral7dp + b.fee7dp).toBe(total);
    expect(b.borrow7dp).toBe((b.collateral7dp * BLEND_BORROW_NUM) / BLEND_BORROW_DEN);
    expect(b.withinDepth).toBe(true);
    expect(b.depthAfter7dp).toBe(b.depthBefore7dp - b.borrow7dp);
  });

  it("flags depth exhaustion", () => {
    const total = usdc7dpFromFloat(100);
    const b = computeBlendTapBreakdown({
      maxTotal7dp: total,
      feeBps: 100,
      availableDepth7dp: usdc7dpFromFloat(1),
    });
    expect(b.withinDepth).toBe(false);
  });
});

describe("displayBlendTapBreakdown", () => {
  it("always produces positive headroom for UI", () => {
    const b = displayBlendTapBreakdown({
      maxTotal7dp: usdc7dpFromFloat(25),
      feeBps: 100,
    });
    expect(b.withinDepth).toBe(true);
    expect(b.depthAfter7dp).toBeGreaterThan(0n);
    expect(b.borrow7dp).toBeGreaterThan(0n);
  });
});
