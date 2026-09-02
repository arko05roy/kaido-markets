import { describe, expect, it } from "vitest";

import { checkpointsFromOutcomeSpace } from "@/lib/stellar/kaido";
import type { MarketParams } from "@/lib/stellar/kaido";

describe("checkpointsFromOutcomeSpace", () => {
  it("returns empty for scalar markets", () => {
    const space = { tag: "Scalar", values: undefined } as MarketParams["outcome_space"];
    expect(checkpointsFromOutcomeSpace(space)).toEqual([]);
  });

  it("maps trajectory checkpoint timestamps", () => {
    const space = {
      tag: "Trajectory",
      values: [[1_700_000_000n, 1_700_000_600n]],
    } as MarketParams["outcome_space"];
    expect(checkpointsFromOutcomeSpace(space)).toEqual([1_700_000_000, 1_700_000_600]);
  });

  it("returns empty when trajectory values are malformed", () => {
    const space = {
      tag: "Trajectory",
      values: [null],
    } as unknown as MarketParams["outcome_space"];
    expect(checkpointsFromOutcomeSpace(space)).toEqual([]);
  });
});
