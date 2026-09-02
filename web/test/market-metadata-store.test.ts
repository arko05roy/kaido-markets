import { describe, expect, it } from "vitest";

import { buildSavedMarketMetadata } from "@/lib/market-metadata-store";

describe("buildSavedMarketMetadata", () => {
  it("preserves createdAt on update", () => {
    const prev = buildSavedMarketMetadata({ question: "Old?" });
    const next = buildSavedMarketMetadata({ question: "New?" }, prev);
    expect(next.question).toBe("New?");
    expect(next.createdAt).toBe(prev.createdAt);
  });

  it("carries optional display fields", () => {
    const meta = buildSavedMarketMetadata({
      question: "How many lies?",
      marketStyle: "kaido",
      outcomeMin: 0,
      outcomeMax: 15,
      divisions: [0, 5, 10, 15],
    });
    expect(meta.outcomeMin).toBe(0);
    expect(meta.divisions).toEqual([0, 5, 10, 15]);
  });
});
