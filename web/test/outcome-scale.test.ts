import { describe, it, expect } from "vitest";

import {
  chartRangeForConfig,
  defaultOpeningCall,
  evenDivisions,
  formatXTick,
  parseOutcomeConfig,
} from "@/lib/outcome-scale";

describe("outcome-scale", () => {
  it("pins chart range to declared config", () => {
    expect(chartRangeForConfig({ style: "kaido", min: 0, max: 100, divisions: [0, 50, 100] }, 50, 10)).toEqual({
      min: 0,
      max: 100,
    });
  });

  it("spaces kaido divisions evenly", () => {
    expect(evenDivisions(0, 100, 5)).toEqual([0, 25, 50, 75, 100]);
  });

  it("labels binary ticks", () => {
    const cfg = parseOutcomeConfig({
      marketStyle: "binary",
      optionLow: "Nope",
      optionHigh: "Yep",
    })!;
    expect(formatXTick(cfg, 0)).toBe("Nope");
    expect(formatXTick(cfg, 100)).toBe("Yep");
    expect(formatXTick(cfg, 40)).toBe("40%");
  });

  it("defaults opening call to midpoint", () => {
    expect(defaultOpeningCall({ style: "binary", min: 0, max: 100, divisions: [0, 100] })).toBe("50");
  });
});
