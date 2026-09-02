import { describe, expect, it } from "vitest";

import {
  isTradingWindowOpen,
  isTradingWindowStale,
  tradingPhase,
} from "@/lib/market-display";

const window = { open: 1000, lock: 2000 };

describe("trading window phases", () => {
  it("distinguishes before-open from after-lock", () => {
    expect(tradingPhase("Open", window, 900)).toBe("before_open");
    expect(tradingPhase("Open", window, 1500)).toBe("open");
    expect(tradingPhase("Open", window, 2500)).toBe("after_lock");
  });

  it("only flags stale after the lock time", () => {
    expect(isTradingWindowStale("Open", window, 900)).toBe(false);
    expect(isTradingWindowOpen("Open", window, 900)).toBe(false);
    expect(isTradingWindowStale("Open", window, 2500)).toBe(true);
  });
});
