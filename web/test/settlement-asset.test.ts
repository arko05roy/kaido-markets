import { describe, expect, it } from "vitest";

import { formatSettlement7dp, formatSettlementAmount } from "@/lib/settlement-asset";

describe("settlement-asset", () => {
  it("formats 7dp amounts with symbol", () => {
    expect(formatSettlement7dp(12_500_000n)).toBe("1.25");
    expect(formatSettlementAmount(50_000_000_000n, { symbol: "KAIDO" })).toBe("5,000 KAIDO");
  });
});
