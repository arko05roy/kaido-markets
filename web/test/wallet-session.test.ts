import { describe, expect, it } from "vitest";

import { LAST_KIND_KEY } from "@/components/wallet/provider";

describe("wallet session persistence", () => {
  it("uses a stable localStorage key for the last connector", () => {
    expect(LAST_KIND_KEY).toBe("kaido.wallet.lastKind");
  });
});
