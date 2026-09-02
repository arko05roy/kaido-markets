import { describe, it, expect } from "vitest";

import {
  chartRangeForConfig,
  defaultOpeningCall,
  defaultTickLabels,
  evenDivisions,
  formatXTick,
  formatXTickAt,
  formatCallLabel,
  interiorTicks,
  parseOutcomeConfig,
  parseTickLabels,
  snapToDivision,
  tickLabelItems,
} from "@/lib/outcome-scale";

describe("outcome-scale", () => {
  it("pins chart range to declared config", () => {
    expect(chartRangeForConfig({ style: "kaido", min: 0, max: 100, divisions: [0, 50, 100] }, 50, 10)).toEqual({
      min: 0,
      max: 100,
    });
  });

  it("spaces legacy even divisions across endpoints", () => {
    expect(evenDivisions(0, 100, 5)).toEqual([0, 25, 50, 75, 100]);
  });

  it("keeps interior ticks off the chart edges", () => {
    expect(interiorTicks(0, 100, 5)).toEqual([16.67, 33.33, 50, 66.67, 83.33]);
    expect(interiorTicks(0, 100, 5)[0]).toBeGreaterThan(0);
  });

  it("maps text tick labels to interior positions", () => {
    const parsed = parseTickLabels(["Dry", "Storm"], 0, 100)!;
    expect(parsed.divisions).toEqual([33.33, 66.67]);
    expect(parsed.divisionLabels).toEqual(["Dry", "Storm"]);
  });

  it("auto-places empty tick slots on the interior", () => {
    const parsed = parseTickLabels(["", ""], 0, 100)!;
    expect(parsed.divisions).toEqual([33.33, 66.67]);
    expect(parsed.divisionLabels).toBeUndefined();
  });

  it("maps numeric tick labels to explicit positions", () => {
    const parsed = parseTickLabels(["25000", "75000"], 0, 100000)!;
    expect(parsed.divisions).toEqual([25000, 75000]);
    expect(parsed.divisionLabels).toBeUndefined();
  });

  it("starts with empty tick labels", () => {
    expect(defaultTickLabels(0, 100, 5)).toEqual(["", "", "", "", ""]);
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

  it("labels kaido division ticks when labels are set", () => {
    const cfg = parseOutcomeConfig({
      marketStyle: "kaido",
      outcomeMin: 0,
      outcomeMax: 10,
      divisions: [3.33, 6.67],
      divisionLabels: ["Dry", "Storm"],
    })!;
    expect(formatXTick(cfg, 3.33)).toBe("Dry");
    expect(formatXTick(cfg, 5)).toBe("5");
  });

  it("formats tick labels by index", () => {
    const cfg = parseOutcomeConfig({
      marketStyle: "kaido",
      outcomeMin: 0,
      outcomeMax: 100,
      divisions: [25, 75],
      divisionLabels: ["Low", "High"],
    })!;
    expect(formatXTickAt(cfg, 1)).toBe("High");
    expect(tickLabelItems(cfg)).toEqual([
      { value: 25, label: "Low" },
      { value: 75, label: "High" },
    ]);
  });

  it("snaps call readout to nearest axis label", () => {
    const cfg = parseOutcomeConfig({
      marketStyle: "kaido",
      outcomeMin: 0,
      outcomeMax: 100,
      divisions: [16.67, 33.33, 50, 66.67, 83.33],
      divisionLabels: ["PAW", "DIK", "EY", "KOR", "ID"],
    })!;
    expect(snapToDivision(cfg, 47)).toBe(50);
    expect(formatCallLabel(cfg, 47)).toBe("EY");
    expect(formatCallLabel(cfg, 83.33)).toBe("ID");
  });

  it("aligns divisionLabels length to divisions when loading metadata", () => {
    const cfg = parseOutcomeConfig({
      marketStyle: "kaido",
      outcomeMin: 0,
      outcomeMax: 100,
      divisions: [10, 20, 30, 40, 50, 60, 70, 80, 90, 92, 94, 96],
      divisionLabels: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"],
    })!;
    expect(cfg?.divisionLabels).toHaveLength(12);
    expect(cfg?.divisionLabels?.[11]).toBe("l");
  });

  it("defaults opening call to midpoint", () => {
    expect(defaultOpeningCall({ style: "binary", min: 0, max: 100, divisions: [0, 100] })).toBe("50");
  });
});
