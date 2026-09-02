import { describe, expect, it, beforeEach } from "vitest";

import { formatUsdc7dp, loadPositions, markClaimed, savePosition } from "@/lib/positions";

describe("positions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("saves and loads position ids", () => {
    savePosition("testnet", "GABC", "CMARKET", 42n);
    const list = loadPositions("testnet", "GABC", "CMARKET");
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("42");
  });

  it("dedupes position ids", () => {
    savePosition("testnet", "GABC", "CMARKET", 1n);
    savePosition("testnet", "GABC", "CMARKET", 1n);
    expect(loadPositions("testnet", "GABC", "CMARKET")).toHaveLength(1);
  });

  it("marks claimed with payout", () => {
    savePosition("testnet", "GABC", "CMARKET", 3n);
    markClaimed("testnet", "GABC", "CMARKET", 3n, 1_500_000n);
    const p = loadPositions("testnet", "GABC", "CMARKET")[0];
    expect(p.claimedAt).toBeDefined();
    expect(p.payout7dp).toBe("1500000");
  });

  it("formats USDC 7dp", () => {
    expect(formatUsdc7dp(15_000_000n)).toBe("1.5");
    expect(formatUsdc7dp(100_000_000n)).toBe("10");
  });
});
