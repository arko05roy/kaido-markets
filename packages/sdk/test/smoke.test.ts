import { describe, expect, it } from "vitest";

import { SDK_VERSION } from "../src/index";

describe("@kaido/sdk scaffold", () => {
  it("exposes a version", () => {
    expect(SDK_VERSION).toBe("0.0.0");
  });
});
